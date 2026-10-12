// Envio GraphQL (Rails, packages/shared/queries.graphql). All history comes from here, never historical RPC.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { z } from "zod";

const require = createRequire(import.meta.url);
const QUERIES = readFileSync(require.resolve("@leash/shared/queries.graphql"), "utf8");

/** Extracts one named operation from queries.graphql so we use Rails' exact queries. */
export function namedQuery(name: string): string {
  const start = QUERIES.indexOf(`query ${name}`);
  if (start < 0) throw new Error(`query ${name} not in queries.graphql`);
  const next = QUERIES.indexOf("\nquery ", start + 1);
  const body = QUERIES.slice(start, next < 0 ? undefined : next);
  return body.replace(/\n#[^\n]*/g, "").trim();
}

export const LeaderboardRow = z.object({
  id: z.string(),
  executed: z.number(),
  rejected: z.number(),
  shadow: z.number(),
  volumeUsd: z.string(),
  realizedPnlUsd: z.string(),
  shadowPnlUsd: z.string(),
  maxDrawdownPct: z.string(),
});
export type LeaderboardRow = z.infer<typeof LeaderboardRow>;

const FeedRow = z.object({ seq: z.union([z.string(), z.number()]), status: z.string(), blockTimestamp: z.union([z.string(), z.number()]) }).passthrough();

export class Envio {
  constructor(
    private readonly url: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get configured() {
    return !!this.url;
  }

  private async gql<T>(query: string, variables: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    if (!this.url) throw new Error("ENVIO_URL not set");
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { data?: unknown; errors?: unknown };
    if (!res.ok || json.errors) throw new Error(`envio ${res.status} ${JSON.stringify(json.errors ?? "")}`);
    return schema.parse(json.data);
  }

  async leaderboard(): Promise<LeaderboardRow[]> {
    return (await this.gql(namedQuery("AgentLeaderboard"), {}, z.object({ Agent: z.array(LeaderboardRow) }))).Agent;
  }

  async recentReceipts(user: string, limit = 20) {
    return (await this.gql(namedQuery("FeedByUser"), { user: user.toLowerCase(), limit }, z.object({ Receipt: z.array(FeedRow) }))).Receipt;
  }

  async activeUsers(): Promise<string[]> {
    const q = "query ActiveMandates { Mandate(where: { paused: { _eq: false } }) { id } }";
    return (await this.gql(q, {}, z.object({ Mandate: z.array(z.object({ id: z.string() })) }))).Mandate.map((m) => m.id);
  }
}
