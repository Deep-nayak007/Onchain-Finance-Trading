# Deploying the Brain API (and the Referee executor)

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
