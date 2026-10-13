# Face → live Brain/Rails: what to change (from Prem/Brain, 2026-10-12)

Brain + Rails are proven on **Monad testnet 10143** (paper mode). Evidence: `docs/testnet-evidence.md`.
API spec: `services/api/openapi.yaml`. Shared code: `packages/shared` (`@leash/shared`).

## Changes needed in apps/mobile
1. **Fill `integration/team.ts`** from `@leash/shared`:
   - addresses: `LEASH.testnet.mandateRegistry.address` / `receiptLog` (`addresses.ts`)
   - ABIs: `mandateRegistryAbi`, `receiptLogAbi` (`@leash/shared/abis`)
   - txs: `sendTx` / `prepareTxRequest` (`@leash/shared/sendTx`, estimate +10%, explicit gas)
   - hashes: already using `@leash/shared/canonical` ✓
   - `setMandate` args: `{policyHash, maxNotionalUsd6, maxLeverageX10, maxWeeklyLossBps, agentId, agentWallet, perplKey, paused:false, updatedAt:0}`, using the values from `/mandate/compile`; convert units with `toUsd6`/`leverageToX10` from `@leash/shared`.
   - `activateAgent` body: `POST /agent/activate {account, txHash}` (Brain waits for the receipt and checks the mandate onchain).
   - Spot: `POST /spot/prepare {account, side: "BUY"|"SELL", sizeUsd}` → `{txs: TxRequest[], estimatedOut, minOut}`.
2. **Allow testnet**: `requireMainnet()` and `txRequestSchema.chainId` only accept 143. Accept 10143 when `EXPO_PUBLIC_CHAIN_ID=10143` (contracts are testnet-only today).
3. **`compileSchema`**: add `agentId: string`, `agentWallet: address | null`, `perplKey: address | null` (null comes with a warning in `warnings[]`).
4. **`riskSchema`**: match `packages/shared/gateway.openapi.yaml`: `ts` is a unix-seconds integer; `weeklyPnlPct` and `liqDistancePct` are decimal **strings**.
5. ~~`/gas/drip` body~~: fixed on the API side; `{account}` and `{address}` are both accepted.

Responses for commands (`/agent/activate`, `/agent/kill`) are `{state, persona, lastTick, lastDecision}`; slack approve/deny return `{request, receipt?}`;
`/slack/pending/:account` returns `SlackRequest[]`. Paper receipts have `execTxHash: null`, so label them "paper".

## Local wiring (Android Studio emulator)
```sh
# Prem's Mac
cd services/api && CHAIN_ID=10143 LOOPS=off pnpm dev        # :8787
# apps/mobile/.env
EXPO_PUBLIC_USE_MOCKS=false
EXPO_PUBLIC_CHAIN_ID=10143
EXPO_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
EXPO_PUBLIC_API_URL=http://localhost:8787
# emulator
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8787 tcp:8787
```
First live check: open receipt `0x215df7fe724810a97a5d2863bb4fc83271b44069c662febc73bfc9445b2841e4`; expect ✓, `usedSlack`, ~1.0 s.

Blockers outside Face: passkey RP domain (team decision; then `assetlinks.json` with the debug SHA-256), live gateway + Envio (Yadnesh), deployed `API_URL` (Prem).

## Passkeys (decided 2026-10-12)
- **Permanent RP ID: `leash-brain-api.onrender.com`** → `EXPO_PUBLIC_PASSKEY_RP_ID=leash-brain-api.onrender.com`. Never change it after accounts exist.
- The Brain API serves the association files (JSON, no redirects), same shape as `scripts/associations.mjs`:
  - `https://leash-brain-api.onrender.com/.well-known/assetlinks.json` (package `app.leash.mobile`, relations `get_login_creds` + `handle_all_urls`)
  - `https://leash-brain-api.onrender.com/.well-known/apple-app-site-association` (`webcredentials` → `<TEAM_ID>.app.leash.mobile`)
  They return 404 until Deep sends: **Android signing SHA-256** (`cd apps/mobile/android && ./gradlew signingReport`, debug is fine for the
  emulator; colon-separated) and, for iPhone, the **Apple Team ID** (paid Apple Developer account). Prem sets them on Render
  (`ANDROID_CERT_SHA256`, `APPLE_TEAM_ID`: public identifiers) and they go live after a restart.
- Then rebuild the native app (associated domains are baked in at build time).
