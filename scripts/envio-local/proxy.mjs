// Read-only public front for the local Envio Hasura (LEASH testnet indexer).
// Only POST /v1/graphql is forwarded, always WITHOUT admin/auth headers (Hasura's public role, which Envio
// grants select-only), mutations/subscriptions are refused, bodies are capped. GET /healthz for checks.
//   node scripts/envio-local/proxy.mjs   (env: PROXY_PORT=8090, HASURA_URL=http://localhost:8080)
import { createServer } from "node:http";

const PORT = Number(process.env.PROXY_PORT ?? 8090);
const UPSTREAM = `${process.env.HASURA_URL ?? "http://localhost:8080"}/v1/graphql`;
const MAX_BODY = 32 * 1024;

const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && req.url === "/healthz") return send(res, 200, { ok: true });
  if (req.method !== "POST" || req.url !== "/v1/graphql") return send(res, 404, { error: "only POST /v1/graphql" });
  let size = 0;
  const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY) req.destroy();
    else chunks.push(c);
  });
  req.on("end", async () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return send(res, 400, { error: "invalid JSON" });
    }
    const q = String(body?.query ?? "");
    if (/^\s*(mutation|subscription)\b/i.test(q) || /\bmutation\s*[{(]/i.test(q)) return send(res, 403, { error: "read-only endpoint" });
    try {
      const r = await fetch(UPSTREAM, {
        method: "POST",
        headers: { "content-type": "application/json" }, // never forward admin/auth headers
        body: JSON.stringify({ query: q, variables: body?.variables ?? {}, operationName: body?.operationName }),
        signal: AbortSignal.timeout(10_000),
      });
      send(res, r.status, await r.json());
    } catch {
      send(res, 502, { error: "indexer unavailable" });
    }
  });
}).listen(PORT, () => console.log(`[envio-proxy] read-only GraphQL on :${PORT} → ${UPSTREAM}`));
