# Current Face service check — October 13, 2026 (Phoenix)

Main `9e10b70` is incorporated into Face, including the latest tunnel pointer rotations; application/service code is unchanged from `c455393`. A GitHub push, a deployed web bundle, and a healthy service are separate checks. The website is still built from main; Face changes require a merge to publish.

| Check | Current result |
|---|---|
| Mobile TypeScript and unit tests | Pass, **38 tests**, including saved-policy integrity and onchain pause/recovery when Brain loses a record |
| Latest Brain tests | **70 pass**, one live Privy integration test deliberately skipped; tested c455393 in the isolated backend checkout |
| Rust gateway | Locked compilation succeeds with installed Rust 1.95.0; crate defines **zero tests** |
| Hosted app / Brain / gateway | HTTP 200; Brain reports testnet 10143 and `live:false`; gateway cache healthy |
| Kuru BUY preparation | 200; two unsigned chain-10143 transactions, nonzero minimum output; no swap submitted |
| Live rule compile / mandate preparation | Pass on the existing disposable test account: Falcon #2227, ready wallet/key, no warnings, matching policy hash and unsigned setMandate with explicit gas 147531 |
| Kuru SELL preparation | **409**, clear no-bids response; no buyers in the live book. This fixes the previous 500 but does not create liquidity |
| Envio | **Intermittent**: initial checks failed with ENOTFOUND; later pointer-based retries recovered indexed receipts and trader counters. The team pushed several tunnel URL rotations during this check |
| Receipt reasoning | Old handoff and latest shadow reason hash `0xde1643…ddc3b` return **404**; indexed commitments remain available |
| Demo agent status | **404 unknown account** after hosting restart; the onchain mandate is independently readable |
| Android native association | **404 not configured**; physical native biometrics/signing remain unverified |

Face adds **Explore the live demo** on Welcome, with real Perpl/Kuru market reads, persona identities/counters, demo-account risk and public receipt browsing. It does not log into the team's demo wallet. Missing history is shown with retry; the known paper receipt can still be read through its confirmed RPC transaction. There is no sample fallback or invented verification.

Paper-mode deposits/manual exchange orders and quotes for an empty book side are disabled with explanations. Saved browser policies are validated and hash-bound; onchain pause state remains visible after a Brain restart. Reconnecting a trader is an explicit action and Brain accepts the policy only if its hash matches the mandate. Read-only status polling never silently activates a trader. Native rule recovery currently keeps the non-secret policy for the session; browser storage persists it.

Production web and iOS/Hermes exports succeed. The complete offline sample smoke passes with zero external requests. A production Face browser candidate, served locally under the intended web origin, passes public live markets/identities/risk/receipts, virtual PRF passkey creation, new-user status, paper setup/rules navigation, disabled exchange orders and live Kuru BUY/no-bids SELL behavior with no runtime errors. A simulated Envio outage still renders the actual confirmed RPC receipt and pending reasoning. These checks establish UI/build behavior, not a physical Face ID ceremony or funded trade. No gas drip, signature, activation, deposit, exchange order or swap was submitted. The gateway deposit preparation still returns its documented 400 stub. Capture: `artifacts/screenshots/web/10-live-demo.png`.

Remaining service work: restore Envio with a reachable URL, persist full receipt reasoning outside `/tmp/leash.db`, finish Perpl deposit/enrollment, and obtain funded test tokens/liquidity for real trading. The deployment's restart recovery can recover policy/wallet links; it cannot reconstruct vanished reasoning from a hash.

One live compilation used the prior disposable test account `0x2635…B708` and can create its backend wallet/key records; it did not sign or activate. Public persona feeds filter by the actual registered agentId, so Falcon's receipts include its user-wallet decisions as well as shadow records.

## Previous Face service check — October 12, 2026

Latest GitHub main `67456c8` is merged into Face, including paper-mode onboarding, the browser passkey error message and new architecture/design documentation. Native RP migration to `leash-brain-api.onrender.com` was explicitly approved by Deep before any LEASH passkeys existed.

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

## Full retry — October 12, 2026 (Phoenix)

Latest main `67456c8` is merged into Face. Results from this retry:

| Check | Result |
|---|---|
| Mobile / shared / Brain / guardian unit tests | 35 + 95 + 68 + 6 = **204 pass**; one real Privy integration test deliberately skipped |
| TypeScript / production web build / sample browser flow | Pass; sample flow makes zero external requests |
| Hosted browser and Face candidate passkeys | Virtual PRF authenticator creates/restores the same account; zero runtime errors |
| Paper onboarding | Hosted main and Face candidate reach rules without Perpl collateral/enrollment; Face shows a clear message for the deposit stub |
| API / RPC / gateway / Envio / Kuru book | Respond correctly on chain 10143; 15 Perpl markets, live book/risk, indexed commitments |
| Live rule compilation | Isolated prior test account: exact canonical policy hash, Falcon #2227, real agent wallet/key, no warnings; unsigned setMandate prepared with explicit gas |
| Kuru BUY quote preparation | 200; two unsigned testnet transactions, estimated output 0.999000999, minimum 0.98901098901 |
| Receipt reasoning / verification | **Failing and unstable**: old demo records return 404; two recent shadow records first returned 200 and then 404 during the retry. Their commitments remain indexed and onchain. Deploy config uses /tmp/leash.db, which resets on restart/redeploy. Persistent backend storage is required |
| Perpl deposit / enrollment | Deposit preparation returns documented 400 BAD_REQUEST; enrollment is still null. Paper onboarding can continue; real trading cannot be accepted |
| Kuru SELL quote | **500 internal error**; SDK book has no bids/buyers. SELL cannot execute with this testnet liquidity |
| Rust gateway | Locked build succeeds on installed Rust 1.95.0; the gateway crate currently defines zero tests. Repo pins 1.94.1 |
| Native association / real signing | Android association remains 404; iPhone native setup still lacks a paid team. Real Touch ID/Face ID, signed rules/activation, deposits/orders/swaps and mainnet execution are unverified |

Brain tests initially failed to load because backend dependencies were absent from the npm mobile workspace. A separate cached checkout installed the unchanged Brain/shared dependencies with frozen pnpm lockfile and then passed all 68 tests; the mobile dependency tree was not replaced. Foundry is not installed, so the Solidity local suite was not rerun. The deployed ReceiptLog event and registry calldata were checked through the RPC.

No gas drip, user signature, agent activation, deposit, order or swap was submitted. One rule compilation used the existing disposable test account and created its backend wallet/key records; only unsigned calldata/quotes were prepared. The public website still deploys main; Face's additional safeguards remain on the face branch.

## Hosted browser check — October 12, 2026 (Phoenix)

- `https://leash-app.onrender.com` returns 200 and serves a live-data web bundle with mocks disabled, chain 10143, the Render Brain/testnet gateway, the rotating Envio pointer and browser RP `leash-app.onrender.com`. This is distinct from the native RP; browser sign-in does not require an Apple Developer membership.
- The deployed browser build created and restored the same wallet using Chromium's **virtual PRF-capable authenticator**. No real Touch ID/Face ID ceremony, gas drip, mandate, agent activation, signature, order or swap was performed. Tests refused service writes and allowed only read-only RPC/GraphQL requests.
- The deployed main build still labelled a fresh wallet TRADER ACTIVE, a missing mandate WITHIN RULES and the testnet spot market AUSD. Those cases are fixed in Face. Existing backend receipt reasoning still returns 404; deposit/enrollment remain deliberately unavailable upstream.
- A production Face browser candidate, loaded locally under the intended web origin, passed virtual-passkey creation/restoration and the same-wallet check, waiting/new-user state, rules-unavailable state, USDC depth label and the public live service checks, with zero runtime errors and zero service writes.
- Switching the export from native RP to browser RP initially reused cached native settings. Metro now fingerprints public build settings in its cache version. Sequential exports without `--clear` independently embedded `leash-brain-api.onrender.com` and `leash-app.onrender.com` correctly.
- Website deployment is from **main**. The Face changes are reviewable on **face** and require a merge into main to publish. No main push or hosting change was performed during these checks.

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
