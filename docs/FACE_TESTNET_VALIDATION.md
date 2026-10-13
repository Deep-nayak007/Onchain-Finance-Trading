# Current Face service check — October 12, 2026

Latest GitHub main `2563d64` is merged into Face. Native RP migration to `leash-brain-api.onrender.com` was explicitly approved by Deep before any LEASH passkeys existed.

- The Render Brain API reports chain **10143**, `live:false`, real HTTP gateway, contracts and three registered personas.
- Rails' shared service file selects **leash-perpl-gateway-testnet.onrender.com** for 10143 and **leash-gateway.onrender.com** for 143. Testnet has 15 markets, MON-PERP id 64; mainnet has MON-PERP id 10. The app rejects a known wrong-network URL and checks market IDs/cache health before gateway reads/preparation. Prepared transactions must match the configured chain.
- Live Perpl market depth and the demo account's zero-balance risk response validate against the consumer schemas. Gateway and Brain HTTP requests allow 90 seconds for free-instance wake-up.
- Kuru `/spot/book` delivers real SDK depth (asks available, no bids). Envio resolves via the team's rotating GitHub pointer, caches it for 60 seconds and retains a fallback endpoint. Its indexed anchors agree with the independently decoded ReceiptLog transaction.
- **Backend blocker:** both the old `0x86e8…75c1` and newer `0x64a5…c52b` receipt reasoning return 404 on Render. Onchain records remain in Envio. Face shows paper/slack metadata and pending verification without a checkmark or invented latency. Feed rows remain visible when reasoning is missing. Prem was offline; no backend records were modified.
- `npm run testnet:check` checks all live services read-only, then exits **2** to identify missing receipt reasoning. This is an unresolved integration check, not a clean end-to-end pass.
- The browser flow passes: public receipt renders the missing-reasoning state; `/dev/services` reads Brain, RPC, Perpl, Kuru and Envio; wallet screens still require sign-in. Screenshots: `08-testnet-receipt-after-migration.png` and `09-testnet-connections.png`.
- TypeScript, all **35 mobile tests** and all **95 shared tests** pass. Production web/iOS/Android JS/Hermes exports pass. Xcode rebuilt and installed the iPhone 17 Pro simulator app with 0 errors (one script-dependency warning); live Brain/RPC/Perpl/Kuru/Envio connections were visually confirmed there. The full sample browser flow passes, including onboarding, deposit/authorization, slack, tamper detection and reset, with **zero external requests**. No Android APK or physical-phone signing was tested.
- Android association is still **404**. iOS association returns **200** with Deep's Personal Team, which does not establish paid-team passkey support. See [passkey setup](FACE_PASSKEY_SETUP.md). `/keys/prepare` returns `keyAddress` and nullable `enrollment`; a null payload leaves authorization unavailable. User pause preparation can work directly onchain when Brain is down.

Run `npm run testnet:ios` or `npm run testnet:web`. On Welcome, choose **Check live connections**. For independent offline testing, run `npm run mock:ios` / `npm run mock:web`.

## Earlier Fly validation (historical; superseded by the current check above)

# Face testnet handoff — October 12, 2026

Profile: Monad testnet **10143**, RPC `https://testnet-rpc.monad.xyz`, Brain API `https://leash-brain-api.fly.dev`, **paper mode**. Brain/Rails' shared package and handoff were taken from merged main commit `27a612c`. No owner code or frozen interface was changed.

From the repository root:

```sh
npm install
npm run testnet:ios
# Browser: npm run testnet:web
# Read-only cloud/RPC check: npm run testnet:check
# Offline sample testing: npm run mock:ios
```

Keep Metro running for development builds. The cloud API does not depend on Prem's Mac or port 8787 forwarding. Tap **Check the testnet receipt** on Welcome; no passkey or wallet login is required for this public receipt. `.env.testnet.example` is committed; Deep's actual `.env` is local and ignored.

## Verified against the deployed services

- `/health`, `/config`, three `/traders` personas and the RPC agree on testnet; the backend reports `live:false`.
- Receipt `0x86e8ca275306825cbd9aed2c7d4dd40bc4a71f055823dd712cec166e70bb75c1` has `usedSlack:true`, `execTxHash:null` and **886 ms** latency, displayed as **0.9 s**.
- Its independent anchor is decoded from [the actual ReceiptLog transaction](https://testnet.monadvision.com/tx/0x8d35d96b72148be12f25514366f98fc63c26970ad310ad24bee0dfd0f30869e4). The app checks the deployed emitter, transaction success, reason hash, signal hash, execution hash and slack flag. Modified reasoning fails verification. The public screen shows **PAPER**, **✓ matches onchain · 0.9 s**, slack used, and a receipt explorer link; there is no venue-trade explorer button.
- Fresh test account `0x2635A8a787F24Bb9CE2BC89F96Bc67ea094cB708` received **0.2 test MON** via `{account}`. [Drip transaction](https://testnet.monadvision.com/tx/0x15f6cbc9f1e3efdd1c620720cda41adbdb9958f6b6762b27ea4da4b613ea6109) succeeded; balance was checked on the RPC; repeating the request returned **409**. No private key was persisted or logged.
- Cloud `/mandate/compile` returned the actual wallet/key fields and a locally matching policy hash. `setMandate` calldata and an explicit gas estimate were prepared for 10143 without sending it.
- Cloud `/spot/prepare` returned a Kuru BUY quote with a nonzero minimum output and unsigned testnet transactions. No swap was sent. SELL input is USD worth of MON, matching the API; testnet dollars are labelled test USDC.
- Browser flow check and iPhone 17 Pro/iOS 26.5 Simulator visually confirmed the public receipt. Captures: `artifacts/screenshots/{web,ios}/07-testnet-paper-receipt.png`.
- Strict TypeScript and **27 mobile tests** passed. The shared package's **95 tests** passed. Testnet production web and iOS/Hermes exports passed.
- The complete sample browser flow passed with the live `.env` present, including reset/empty/onboarding/slack and zero external API/RPC calls. Explicit profiles block Expo's development dotenv context to keep mock and testnet modes independent.

`npm run testnet:check` is read-only. Its optional `--exercise-wallet` flag creates a fresh ephemeral test wallet, consumes one testnet drip and one cloud compilation, and prepares unsigned transactions. It never activates a trader or submits an app signature/order.

## Still required

- Device association/signing setup for the now-confirmed permanent RP `leash-brain-api.fly.dev`; see [FACE_PASSKEY_SETUP.md](FACE_PASSKEY_SETUP.md). Both association URLs are awaiting signing details; Deep has no paid Apple account. Real Face ID login/recovery and signed rules/slack/pause/resume have not been validated.
- Gateway and Envio URLs from Rails. General history/PnL/risk/order preparation waits for those services; there is no sample fallback. The bounded, explicit receipt transaction proof is only for public checks until Envio arrives.
- ERC-8004 registrations, real venue liquidity/funding and final footage. Mainnet and real-money trading remain unproven.

The sample video and screenshots 01–06 still contain sample data. Screenshot 07 is the real testnet paper receipt, which is evidence of an onchain decision commitment, not an executed exchange trade.
