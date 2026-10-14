// Entrypoint: load .env (never printed), restore the durable store, build the app, start loops, serve.
import "dotenv/config";
import { serve } from "@hono/node-server";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { Store } from "./store/db";
import { DurableMirror } from "./store/mirror";

const cfg = loadConfig();
const store = new Store(cfg.DATABASE_PATH);
let mirror: DurableMirror | null = null;
if (cfg.DATABASE_URL) {
  mirror = DurableMirror.fromUrl(cfg.DATABASE_URL, store);
  // Restore BEFORE loops start, so RUNNING traders resume and receipts keep their reasoning across restarts.
  try {
    const n = await mirror.restore();
    console.log(`[leash-api] durable store: restored ${n} rows from Postgres`);
  } catch (e) {
    // Degraded, not down: serve and keep mirroring new writes (upserts never erase other rows); /health shows the error.
    console.error(`[leash-api] durable store: RESTORE FAILED, starting with local state only: ${(e as Error).message.slice(0, 200)}`);
  }
  mirror.attach();
} else console.log("[leash-api] durable store: OFF (DATABASE_URL unset) — state is lost on redeploy");

const { app, scheduler, summary } = buildApp(cfg, { store, durable: () => mirror?.status ?? null });
console.log(`[leash-api] ${summary}`);
if (process.env.LOOPS !== "off") scheduler.start();

const server = serve({ fetch: app.fetch, port: cfg.PORT }, (info) => console.log(`[leash-api] listening on :${info.port}`));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    scheduler.stop();
    // Flush pending writes to Postgres before the host kills us (Render gives ~30s).
    void (mirror?.drain() ?? Promise.resolve()).finally(() => server.close(() => process.exit(0)));
  });
}
