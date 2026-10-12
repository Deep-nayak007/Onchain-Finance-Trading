// Entrypoint: load .env (never printed), build the app, start loops, serve.
import "dotenv/config";
import { serve } from "@hono/node-server";
import { buildApp } from "./app";
import { loadConfig } from "./config";

const cfg = loadConfig();
const { app, scheduler, summary } = buildApp(cfg);
console.log(`[leash-api] ${summary}`);
if (process.env.LOOPS !== "off") scheduler.start();

const server = serve({ fetch: app.fetch, port: cfg.PORT }, (info) => console.log(`[leash-api] listening on :${info.port}`));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    scheduler.stop();
    server.close(() => process.exit(0));
  });
}
