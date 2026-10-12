// DEMO ONLY: a tiny stand-in for the Perpl gateway's /health and /risk so the Referee breach can be filmed
// before the real gateway is live. Serves Rails' mock shapes with a scenario applied.
//   pnpm demo-gateway [weekly_loss|liq|stale|ok] [port]
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const scenario = process.argv[2] ?? "weekly_loss";
const port = Number(process.argv[3] ?? 8790);
const mock = (f: string) => JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "services", "perpl-gateway", "mock", f), "utf8"));

createServer((req, res) => {
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (scenario === "stale") return send(503, { code: "STALE_CACHE", message: "demo: gateway cache stale" });
  if (req.url === "/health") return send(200, mock("health.json"));
  const m = /^\/risk\/(0x[0-9a-fA-F]{40})$/.exec(req.url ?? "");
  if (m) {
    const risk = { ...mock("risk.json"), account: m[1], ts: Math.floor(Date.now() / 1000) };
    if (scenario === "weekly_loss") risk.weeklyPnlPct = "-12.40";
    if (scenario === "liq") risk.positions = risk.positions.map((p: object) => ({ ...p, liqDistancePct: "3.10" }));
    return send(200, risk);
  }
  send(404, { code: "NOT_FOUND", message: "demo gateway" });
}).listen(port, () => console.log(`[demo-gateway] scenario=${scenario} on :${port} (DEMO ONLY)`));
