# Deploying the Brain API (and the Referee executor)

**Current hosting (free, no card): Render.** Blueprint `deploy/render.testnet.yaml` → services `leash-brain-api`
(https://leash-brain-api.onrender.com) and `leash-perpl-gateway-testnet` (https://leash-perpl-gateway-testnet.onrender.com), testnet 10143,
`LIVE=false`. Secrets: uploaded per service via Environment → "Add from .env" from the gitignored `services/api/.env.render` and
`services/perpl-gateway/.env.render`. Free plan: sleeps after 15 min idle (`.github/workflows/keepalive.yml` pings every 10 min), no
persistent disk (Brain SQLite + gateway keystore reset on restart: re-run compile → setMandate → activate for the demo user).
When the Envio tunnel URL changes: update `ENVIO_URL` on the leash-brain-api service (Environment) + `SERVICES.envioUrl`.
Web front end: static site `leash-app` (https://leash-app.onrender.com), Face's Expo web export **live on testnet**
(`EXPO_PUBLIC_USE_MOCKS=false`, passkey RP = `leash-app.onrender.com`, Envio via the `deploy/envio-url.txt` pointer). Native builds
use RP `leash-brain-api.onrender.com`; a passkey made on one is not valid on the other.
The Fly apps below were stopped when the Fly trial ended (kept for reference).

**Live:** `API_URL=https://leash-brain-api.onrender.com` (Fly.io, app `leash-brain-api`, region lax, 1 GB volume `leash_data`,
chain 10143, `LIVE=false`). Deployed 2026-10-12. Redeploy from the repo root:
`fly deploy . --config services/api/fly.toml --remote-only`. Secrets: `fly secrets list --app leash-brain-api` (names only).
When Rails' URLs exist: `fly secrets set GATEWAY_URL=... ENVIO_URL=... --app leash-brain-api`.

**Perpl gateway (Rails' code, Brain-hosted):** `GATEWAY_URL=https://leash-perpl-gateway-testnet.onrender.com` (Fly app `leash-perpl-gateway`, lax,
1 GB volume `gw_data` at /data, chain 10143). Config: `services/perpl-gateway/fly.toml` (public env); secrets `MONAD_RPC` and
`GATEWAY_KEYSTORE_PASSWORD` in Fly only (password backed up in gitignored `services/perpl-gateway/.env`). Redeploy:
`cd services/perpl-gateway && fly deploy --remote-only`. Brain uses it via the `GATEWAY_URL` Fly secret on `leash-brain-api`.

**Envio (current):** self-hosted on Prem's Mac: `scripts/envio-local/start.sh` runs `envio dev` (Postgres + Hasura in Docker), a
read-only proxy (`scripts/envio-local/proxy.mjs`: only `POST /v1/graphql`, public role, admin headers stripped, mutations refused) and a
Cloudflare quick tunnel. Current `ENVIO_URL=https://making-spyware-determines-establishing.trycloudflare.com/v1/graphql`. **The URL changes if the tunnel restarts**: then update `ENVIO_URL` on
`leash-brain-api` (`fly secrets set ENVIO_URL=… --app leash-brain-api`) and tell Deep. Stop: `scripts/envio-local/stop.sh`.

**Envio (target):** hosted on **Envio Cloud** (Rails' account), see docs/TESTNET_PLAN.md. A self-host recipe (Hasura + `envio start` + Fly
Postgres) is in `indexer/deploy/` but not deployed: the Fly trial org blocks additional apps without a card.

The API needs a **persistent disk** (SQLite at `DATABASE_PATH`) and **public HTTPS** (the app calls it).
Any of Railway, Fly.io or Render works. Secrets go in the host's env settings, never in the image.

## Image
```bash
# from the repo root
docker build -f services/api/Dockerfile -t leash-api .
docker run -p 8787:8787 -v leash-data:/data --env-file services/api/.env leash-api
curl localhost:8787/health   # shows which integrations are wired (no secrets)
```
Smoke-tested 2026-10-12: builds, boots and serves `/health` (864 MB image). With no env it degrades safely to
fallback-only LLM, local receipts and no drip.

## Env (names in `services/api/.env.example`)
Minimum for testnet paper mode: `CHAIN_ID=10143`, `MONAD_TESTNET_RPC_URL`, `LLM_*`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`,
`GAS_TANK_PRIVATE_KEY`, `PERSONA_WALLETS` (from `pnpm --filter @leash/api persona-wallets`), `LIVE=false`.
Add `GATEWAY_URL` (Rails) and `ENVIO_URL` (Rails) when live; without them the in-process gateway mock is used and
`/traders` has no stats. `ALCHEMY_WEBHOOK_SIGNING_KEY` enables `/webhooks/alchemy`.

## Fly.io example
```bash
fly launch --no-deploy --dockerfile services/api/Dockerfile --name leash-api
fly volumes create leash_data --size 1
# fly.toml: [mounts] source="leash_data" destination="/data";  [http_service] internal_port=8787
fly secrets set CHAIN_ID=10143 LIVE=false ...   # one per var in .env.example
fly deploy
```
Then send `API_URL=https://leash-api.fly.dev` to Deep.

## Referee executor
`guardian/` runs next to the API (or as a second process/service):
```bash
cd guardian && CHAIN_ID=10143 pnpm referee            # every 60s; --once for a single round; --log ../docs/referee-sim.log
```
Needs `REFEREE_PRIVATE_KEY`, `MONAD_TESTNET_RPC_URL`, `GATEWAY_URL`, `ENVIO_URL` (or `REFEREE_WATCH=0xuser,...`).
Keep MON on the referee address for gas. The CRE workflow is in `guardian/cre/` (`cre workflow simulate referee -T staging-settings`).

## Going live (Prem only)
1. Contracts on 143 in `addresses.ts` (Rails) + `CHAIN_ID=143` + mainnet RPC.
2. Re-run `persona-wallets` on 143 (policies are per chain) and update `PERSONA_WALLETS`.
3. Fund agent/persona/gas-tank/referee wallets with MON (Reserve Balance).
4. `LIVE=true`, `MAX_ORDER_USD=25`. **Ask Prem before flipping.**
