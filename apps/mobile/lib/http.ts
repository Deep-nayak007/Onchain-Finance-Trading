import type { ZodType } from 'zod';
export class ServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
// "Failed to fetch" = the request never reached the service (a free-tier restart/deploy, or a network blip). Every
// LEASH endpoint is safe to repeat (drip is one-per-address, activate/compile are idempotent), so retry briefly.
const RETRY_DELAYS_MS = [2000, 5000, 10000];
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      if (aborted || attempt >= RETRY_DELAYS_MS.length) {
        if (aborted) throw error;
        throw new Error(
          'Could not reach the LEASH service. It may be restarting; wait a minute and try again.',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}
export async function request<T>(
  base: string,
  path: string,
  schema: ZodType<T>,
  body?: unknown,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  if (!base) throw new Error('This service is not connected yet. Add its URL to apps/mobile/.env.');
  const controller = new AbortController();
  // Render's free Brain and gateway instances can take about a minute to wake up.
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 90000);
  try {
    const response = await fetchWithRetry(`${base.replace(/\/$/, '')}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const message =
        payload && typeof payload === 'object' && ('error' in payload || 'message' in payload)
          ? 'error' in payload
            ? payload.error
            : (payload as { message: unknown }).message
          : null;
      throw new ServiceError(
        response.status,
        typeof message === 'string'
          ? message.slice(0, 500)
          : `The service returned ${response.status}. Refresh or try again shortly.`,
      );
    }
    const result = schema.safeParse(response.status === 204 ? null : await response.json());
    if (!result.success)
      throw new Error(
        'The service sent data this app cannot read. Ask the team to check the shared interface.',
      );
    return result.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error('The service took too long to respond. Check your connection and retry.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
