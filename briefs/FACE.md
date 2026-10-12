# FACE — Mobile app, visual identity, demo video

> Paste into your coding agent with `ARCHITECTURE.md`. Work in `apps/mobile/` on branch `face`. The visual reference is the team briefing page's mockups (Home, Receipts, Slack request, Traders).

## Mission
The app is what judges see and remember. It should feel like a calm bank app with one strong idea: a leash. Every screen reads real data (Envio, gateway, API); until those exist, use `packages/shared/fixtures/` behind `USE_MOCKS=true`.

## Visual identity (keep it consistent)
- Dark app: deep ink background, one violet accent for actions, **rope amber** for slack/tension, green/red only for state.
- Display numbers in a condensed bold face (e.g. Big Shoulders Display); body in IBM Plex Sans; receipts in IBM Plex Mono.
- **Leash ring** on Home: amber arc = slack left this week (`slackLeftUsd` / weekly risk budget).
- **Receipts are thermal paper**: off-white, monospace, zig-zag bottom edge, rotated stamps (EXECUTED green, DENIED red, PAUSED amber, SHADOW violet), "✓ matches onchain · 0.9 s".
- Copy: "dollars", "your trader", "rules", "slack", "pull the leash". AUSD only in small print.
- Haptics: success on signing, a heavy "tug" on pull-the-leash. Respect reduced motion.

## Hour 0 (before UI)
1. Agree the production domain with the team (passkeys bind to it forever).
2. Expo **dev build** on a real iPhone with associated domains (`apple-app-site-association` + `assetlinks.json` hosted on that domain).
3. Mera React Native guide: create passkey → derive EOA → sign a test tx on 10143.
4. Blocked after 2h → installable mobile PWA with Mera web on the same domain; tell the team.

## Deliverables

| Due | Screen / feature | Data | Acceptance |
|---|---|---|---|
| **CP0** Sun 23:00 | Face ID passkey working in the dev build | Mera | Address shown on device |
| CP1 Mon 12:00 | **Onboarding** (create/restore, `POST /gas/drip`, `POST /devices`) | Mera, API | New user funded with gas < 30s |
| CP1 | **Home**: balance in dollars, leash ring, trader status chip, week P&L, rules summary, "Hold to pull the leash" | RPC, gateway `/risk`, API | On fixtures |
| CP1 | **Rules writer**: text → `POST /mandate/compile` → Leash Card | API | On fixtures |
| CP2 Mon 20:00 | **Perpl setup**: deposit + authorize trade-only key (user signs prepared txs) | gateway | Collateral visible |
| CP2 | **Sign Leash Card** (`setMandate`) → `POST /agent/activate` | MandateRegistry | Mandate on explorer |
| CP2 | **Receipts feed**: Envio receipts, tap → `GET /receipts/:reasonHash`, **recompute `reasonHash` with `canonical.ts` + keccak on device**, show ✓ only on match; show `confirmedAtMs − decidedAtMs` | Envio, API | Live receipt verifies ✓ |
| CP3 Tue 08:00 | **Slack sheet**: push or `GET /slack/pending` → "Falcon is asking for more leash" → why chips → Face ID → `grantSlack` → `POST /slack/:id/approved` | API, MandateRegistry | Denied → approved → executed in the demo |
| CP3 | **Risk view** (Perpl Analytics): positions, liq distance, exposure, weekly loss vs limit, funding, PnL curve | gateway, Envio | Refresh ≤ 5s |
| CP3 | **Traders**: Falcon/Otter/Owl cards, LIVE/SHADOW pill, 7-day %, receipts, max drop, ERC-8004 link | API `/traders`, Envio | Shows real stats |
| CP3 | **Spot swap** (Kuru Consumer): AUSD↔MON with book depth, user-signed | Brain's Kuru helper | One real swap |
| CP3 | **Manual Perpl trade** quick action (Agora requirement) | gateway `/orders/prepare` | One real trade |
| CP3 | **Kill switch**: long-press → Face ID → `pause(user,"user")` → `POST /agent/kill` | MandateRegistry, API | Trader stops; receipts show PAUSED |
| Ship | **2-minute video** (script on the briefing page) + 6 screenshots; confirm cutoff time and form fields (Q9) | — | Uploaded |
| Stretch | Aurora any-chain funding | API | After CP3 |

## Implementation notes
- Mera mode: **prompt per transaction** (`getPasskeyPrfOutput` → session → send → `session.end()`). Store only `credentialId` + transports in SecureStore. Handle `PRF_UNAVAILABLE`, `PASSKEY_OPERATION_FAILED`, `CRYPTO_UNAVAILABLE`, `SESSION_ENDED`.
- viem with `monad` (143); every tx via `sendTx.ts` (explicit gas). No EIP-7702 on the user wallet.
- One typed client each for API, gateway, Envio; React Query polling 2–5s.
- Record clean screen captures of each screen as soon as it works; the video is assembled from them.

## You consume
§7.2 schemas + fixtures, §7.3 gateway, §7.4 API, §7.5 queries, addresses from Rails.

## Docs to load
Mera guide + React Native guide (docs.monad.xyz/guides/mera, /guides/mera/react-native), Mera authenticator support, viem Monad chains, Expo notifications, Expo SecureStore, `frontend-design` skill if available.
