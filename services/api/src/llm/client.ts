// Qwen through an OpenAI-compatible API. JSON MODE ONLY (no tool calling):
// strict system prompt with the exact schema → response_format json_object → zod → one retry with
// the validation error → caller falls back to llm/fallback.ts. The provider is swappable via env only.
import OpenAI from "openai";
import type { z } from "zod";

export type LlmSettings = {
  baseURL: string;
  apiKey: string;
  timeoutMs: number;
};

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: "unconfigured" | "transport" | "invalid",
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export type JsonCall = { model: string; system: string; user: string; temperature?: number };

/** Minimal surface so tests can inject a fake. */
export interface ChatJson {
  complete(call: JsonCall & { history?: { role: "assistant" | "user"; content: string }[] }): Promise<string>;
}

export class OpenAiChatJson implements ChatJson {
  private readonly client: OpenAI;
  constructor(s: LlmSettings) {
    this.client = new OpenAI({ baseURL: s.baseURL, apiKey: s.apiKey, timeout: s.timeoutMs, maxRetries: 0 });
  }

  async complete(call: JsonCall & { history?: { role: "assistant" | "user"; content: string }[] }): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: call.model,
      temperature: call.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: call.system }, { role: "user", content: call.user }, ...(call.history ?? [])],
    });
    const text = res.choices[0]?.message?.content;
    if (!text) throw new LlmError("empty completion", "transport");
    return text;
  }
}

/** Strips ```json fences some models add even in JSON mode. */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(t);
}

/**
 * Calls the model in JSON mode and validates with zod. On parse/validation failure, retries once
 * with the error appended. Throws LlmError when both attempts fail or transport fails.
 */
export async function completeJson<S extends z.ZodType>(chat: ChatJson | null, schema: S, call: JsonCall): Promise<{ data: z.infer<S>; model: string }> {
  if (!chat) throw new LlmError("LLM not configured", "unconfigured");
  let first: string;
  try {
    first = await chat.complete(call);
  } catch (e) {
    throw e instanceof LlmError ? e : new LlmError(`LLM request failed: ${(e as Error).message}`, "transport");
  }
  const attempt1 = validate(schema, first);
  if (attempt1.ok) return { data: attempt1.data, model: call.model };

  let second: string;
  try {
    second = await chat.complete({
      ...call,
      history: [
        { role: "assistant", content: first.slice(0, 4000) },
        {
          role: "user",
          content: `Your JSON was invalid: ${attempt1.error}. Reply again with ONLY one JSON object that matches the schema exactly.`,
        },
      ],
    });
  } catch (e) {
    throw new LlmError(`LLM retry failed: ${(e as Error).message}`, "transport");
  }
  const attempt2 = validate(schema, second);
  if (attempt2.ok) return { data: attempt2.data, model: call.model };
  throw new LlmError(`LLM output invalid after retry: ${attempt2.error}`, "invalid");
}

function validate<S extends z.ZodType>(schema: S, text: string): { ok: true; data: z.infer<S> } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    return { ok: false, error: `not JSON (${(e as Error).message})` };
  }
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const msg = r.error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: msg };
}

export function makeChat(cfg: { LLM_BASE_URL?: string; LLM_API_KEY?: string; LLM_TIMEOUT_MS: number }): ChatJson | null {
  if (!cfg.LLM_BASE_URL || !cfg.LLM_API_KEY) return null;
  return new OpenAiChatJson({ baseURL: cfg.LLM_BASE_URL, apiKey: cfg.LLM_API_KEY, timeoutMs: cfg.LLM_TIMEOUT_MS });
}
