# Face validation

October 12 update: the deployed testnet API, public receipt in browser and iOS Simulator, 0.2 test MON drip, cloud rule compilation, unsigned mandate preparation and unsigned Kuru BUY quote have now been checked. Shared sender/hash tests also pass. See [FACE_TESTNET_VALIDATION.md](FACE_TESTNET_VALIDATION.md) for current evidence and remaining blockers. The table below records the earlier sample build, before the live handoff.

Validated October 11, 2026, America/Phoenix, on this Mac with Xcode.

| Check | Result |
|---|---|
| Strict TypeScript | Pass |
| Unit tests | 21 pass: pinned canonical/Keccak vector, modified receipts/signals, independent anchors, pending confirmation, receipt intent linkage, transaction validation, exact USD units, explicit review/cancellation, missing integration guard, mock reset/renewal and fixture validation |
| Browser flow checks | Pass: short hold cancels, 1.2s hold pauses, resume, denied → approved slack → executed receipt, tamper failure/restore, persona selection, stale card clearing, sample compile/activation, every route, spot quote/swap, manual cap/order, desktop layout |
| Browser runtime/console errors | None in the flow check |
| Expo Doctor | 21/21 pass |
| Xcode simulator build | Success: 0 errors, 1 generated build-phase warning |
| Installed app | Running on iPhone 17 Pro / iOS 26.5 Simulator |
| Production web export | Pass |
| Production iOS/Hermes export | Pass |
| Live bundle without shared canonicalizer | Correctly rejected: `Live mode requires Prem’s packages/shared/canonical.ts.` |
| Native screenshots | Six actual 1206×2622 Simulator captures, visually checked |
| Browser screenshots | Six 1170×2532 captures |
| Video | 120.000 seconds, 1920×1080 H.264 + AAC; sample-data label and narration; representative frame visually checked |
| Dependency audit | Unresolved: 18 high + 11 moderate inherited reports after compatible audit fix; details in LIMITATIONS.md |

The first native build from Desktop failed because Apple File Provider metadata made a framework unsignable. Rebuilding the same source/dependencies from the local cache succeeded; `ios:cached` automates that workaround.

Metro reports upstream package-export warnings for viem/ox's nested noble crypto imports and falls back to file resolution. Both native execution and production exports succeed. The generated Xcode dev-launcher phase also warns about dependency analysis. These warnings are not hidden or treated as proof of a security review.

Not yet validated: a real Face ID passkey on a physical phone, synced account recovery, a real testnet transaction, any mainnet send, actual exchange authorization, actual indexed receipt verification, or live services. The missing domain/signing/shared-service dependencies are recorded in FACE_CHECKLIST.md and LIMITATIONS.md. No funds were moved.

Mock testing follow-up: consolidated samples into `apps/mobile/mocks/data.json`, added reset/empty/renew controls and demo onboarding, and changed the simulator launcher to localhost. The installed app was observed loading successfully under its existing strict ATS configuration; no native rebuild was needed. Unit suite now has 21 passing tests. Browser checks include demo gas/deposit/enrollment, empty/reset states, and asserting that no external API/RPC requests occur.
