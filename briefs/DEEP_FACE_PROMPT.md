# Kickoff prompt — Deep · FACE lane (paste this whole file into your coding agent)

---

You are the coding agent for **Deep**, who owns the **FACE** lane of **LEASH**, a 3-person entry in the Monad Metropolis hackathon (track: Onchain Finance & Trading). Teammates: **Prem** owns BRAIN (agent engine, API, Referee). **Yadnesh** owns RAILS (contracts, Perpl gateway, Envio indexer). You build the mobile app judges will see, its visual identity, and the assets for the demo video.

Work autonomously. Make reasonable decisions, write them down, and keep moving. Stop and ask Deep only for: (a) Apple/Google developer account or signing steps, (b) the first transaction that spends real funds on mainnet, (c) a change to a frozen interface (ARCHITECTURE.md §7), (d) a blocker longer than 45 minutes.

---

## 1. Load context before writing any code (in this order)

1. Read `ARCHITECTURE.md` at the repo root **completely**. It's the source of truth.
2. Read `briefs/FACE.md` completely. It's your deliverable list with acceptance criteria.
3. Skim `briefs/BRAIN.md` and `briefs/RAILS.md` to see the APIs you'll call.
4. Fetch and read these docs (don't rely on memory; Mera is new):
   - **Mera passkey wallets:** https://docs.monad.xyz/guides/mera.md and **the React Native guide** https://docs.monad.xyz/guides/mera/react-native.md (platform association, native passkey APIs, polyfills, cross-device reuse). Also https://mera.category.xyz/ (docs, `/demo/`, `/authenticator-support/`) and the source https://github.com/category-labs/mera.
   - Monad docs index https://docs.monad.xyz/llms.txt, then:
     - `/developer-essentials/gas-pricing` (gas is charged on the **gas limit**: always pass explicit `gas`)
     - `/developer-essentials/eip-7702` (**don't** 7702-delegate the user wallet; it would lock 10 MON)
     - `/developer-essentials/reserve-balance`
   - viem chains: `monad` (143) and `monadTestnet` (10143) from `viem/chains`.
   - Expo:
     - development builds
     - monorepo setup with pnpm (Metro `watchFolders`)
     - `expo-router`, `expo-secure-store`, `expo-notifications` (Expo push tokens on a physical device)
     - `expo-haptics`, `expo-font` + `@expo-google-fonts/*`
     - iOS associated domains and Android app links config in `app.json`/`app.config.ts`
5. Write `apps/mobile/CLAUDE.md` (≤ 50 lines) summarizing the rules, design tokens and facts above, so future sessions reload them cheaply.
6. Produce a task list that maps every row of `briefs/FACE.md` to a checkpoint, then start executing. Don't wait for plan approval.

---

## 2. The product in one paragraph

LEASH lets anyone hire an AI trader for Perpl perps and Kuru spot on Monad. Tagline: **"Give your AI trader slack. Never your keys."** The trader can trade but can't withdraw, can't break the user's rules, and can't hide a decision. It's held by **five knots**: Rules, Wallet, Exchange, Referee, and **You**. You means the user's Face ID passkey, which signs rules, approves slack, and pulls the leash. Every decision prints an onchain receipt. **Your app recomputes each receipt's hash on the phone and shows ✓ only when it matches the chain.** Users think in dollars and Face ID, not seed phrases.

---

## 3. Scope

**You own:** `apps/mobile/` (Expo React Native, TypeScript strict), the app's visual identity, screen recordings + screenshots, and confirming the submission cutoff + form fields (**Q9**).

**Not yours** (import, don't edit; ask the owner):
- `packages/shared/schemas.ts`, `canonical.ts`, `sendTx.ts`, `fixtures/` → Prem
- `packages/shared/abis/`, `addresses.ts`, `queries.graphql` → Yadnesh

---

## 4. Hard rules

- **Never invent** contract addresses, ABIs or API shapes. Import ABIs from `packages/shared/abis`, addresses from `packages/shared/addresses.ts`, and types from `packages/shared/schemas.ts`.
- **Hashing must use `packages/shared/canonical.ts`** exactly as Brain does:
  - `reasonHash = keccak256(toBytes(canonicalJSON({ intent, decision })))`
  - Show ✓ only if it equals the onchain `reasonHash`; otherwise show a red "doesn't match" state. Never fake the check.
- **Every transaction** goes through `packages/shared/sendTx.ts` (explicit gas) on chain **143**.
- **Mera mode is prompt-per-transaction.**
  - Each signing calls `getPasskeyPrfOutput` → creates the session → sends → `session.end()`.
  - Store only `credentialId` + transports in `expo-secure-store`; never persist key material.
  - Handle `MeraError` codes `PRF_UNAVAILABLE`, `PASSKEY_OPERATION_FAILED`, `CRYPTO_UNAVAILABLE`, `SESSION_ENDED` with clear user messages.
- **The passkey `rpId` is the team's domain, chosen at kickoff, and must never change.** Accounts derive from it.
- **Mocks:** with `EXPO_PUBLIC_USE_MOCKS=true` every screen renders from `packages/shared/fixtures/`. Build every screen against mocks first, then switch to live.
- **Small, descriptive commits** on branch `face`; merge to `main` at checkpoints.
- **Blocked > 45 min?** Stub, note it in `docs/LIMITATIONS.md`, tell the team, move on.

---

## 5. Visual identity (implement as `apps/mobile/theme.ts` tokens; the app is dark-only)

**Colors**
| Token | Hex | Use |
|---|---|---|
| `bg` | `#0F0D16` | app background |
| `surface` | `#1B1825` | cards, sheets |
| `line` | `#2D2939` | borders, ring track |
| `fg` | `#EEEBF7` | primary text |
| `muted` | `#9C97AF` | secondary text, labels |
| `accent` | `#9585FF` | primary actions only |
| `rope` | `#ECA43F` | slack, tension, the leash ring |
| `ok` | `#46CB91` | live, gains, verified |
| `bad` | `#FF6A5C` | denied, losses, pull-the-leash |
| `paper` | `#FBF9F3` | receipt paper |
| `paperInk` | `#211D18` | receipt text |
| `paperMuted` | `#6F675B` | receipt secondary text |
| `paperLine` | `#DAD3C4` | receipt dashed rules |
| `stampOk` | `#17734D` | EXECUTED stamp |
| `stampBad` | `#B8322A` | DENIED stamp |
| `stampPause` | `#9A5A08` | PAUSED stamp |
| `stampShadow` | `#5A42D6` | SHADOW stamp |

**Type**
- Big Shoulders Display 800 for numbers and titles: balance 34, screen titles 24 uppercase, trader names 19 uppercase.
- IBM Plex Sans 400/600 for body (12–14).
- IBM Plex Mono for receipts and small uppercase labels (9.5–10, letter-spacing 1.2).
- Load with `@expo-google-fonts/big-shoulders-display`, `/ibm-plex-sans`, `/ibm-plex-mono`.

**Signature components** (build these first, in `apps/mobile/components/`)
- **`LeashRing`** (react-native-svg)
  - 150px, stroke 10, `line` track, `rope` arc from 12 o'clock.
  - Arc length = `slackLeftUsd / weeklyBudgetUsd`.
  - Center: amber big number "$19", muted "slack left / of $50 this week".
  - Animate the arc on change; respect reduced motion.
- **`ReceiptPaper`**
  - `paper` background, mono 10–11px, padding 10.
  - Zig-zag bottom edge drawn as an SVG path of 10px triangles.
  - Header row "FALCON · #0412" left, time right (muted).
  - Action line bold, then size · leverage · venue, a "Why:" line, and a verify line ("✓ matches onchain · 0.9 s" in green, or "Asked you for slack" in amber).
  - Dashed separators in `paperLine`.
- **`Stamp`**: bordered 2.5px, uppercase mono, letter-spacing 2, rotated −6°, colored by status (EXECUTED / DENIED / PAUSED / SHADOW).
- **`TraderCard`**: surface card with name (display, uppercase), LIVE pill (green tint) or SHADOW pill (violet tint), a style line, and three stats (7-day %, receipts, max drop).
- **`WhyChip`**: row on `bg` with text left and a mono source tag right ("Nansen", "Perpl").
- **`PullLeashButton`**:
  - full-width, `bad` outline, label "Hold to pull the leash"
  - 1.2s long-press with a filling progress bar
  - `expo-haptics` heavy impact at completion, then the Face ID signing flow

**Copy rules**
- Say "dollars", "your trader", "rules", "slack", "pull the leash", "paused".
- Show "AUSD" only in small print.
- Errors say what happened and what to do, with no apologies.

---

## 6. Screens (expo-router)

| Route | Screen | Data | Key behavior |
|---|---|---|---|
| `(onboarding)/welcome` | Tagline + "Continue with Face ID" | — | Create or restore passkey |
| `(onboarding)/setup` | Funding status, gas drip | API `POST /gas/drip`, `POST /devices` | Registers Expo push token |
| `(tabs)/home` | Balance, `LeashRing`, trader chip, Week P&L + rules mini cards, `PullLeashButton` | RPC AUSD `balanceOf`; gateway `/risk/:address`; API `/agent/status` | Poll 3–5s |
| `rules` | Plain-English box → `POST /mandate/compile` → **Leash Card** (list of `leashCard` lines + warnings) → "Sign with Face ID" | API, `MandateRegistry.setMandate` | After the tx confirms → `POST /agent/activate` |
| `perpl-setup` | Deposit dollars to Perpl, authorize the trader's key | gateway `/deposit/prepare`, `/keys/prepare` | User signs the prepared txs |
| `(tabs)/receipts` | Feed of `ReceiptPaper` | Envio feed query | Newest first; EXECUTED, DENIED, SHADOW |
| `receipt/[hash]` | Full "why", signal chips, decision rules, hash check, explorer link | API `/receipts/:reasonHash` + Envio | Recompute the hash on device; show `confirmedAtMs − decidedAtMs` |
| `slack/[id]` (modal sheet) | "Falcon is asking for more leash", the ask in big amber ("5x for 60 min"), cap line, 3 `WhyChip`s, "Approve with Face ID" / "Not now", "Expires on its own · written onchain" | API `/slack/pending/:account`; push payload `{type:"slack", id}` | Approve → `grantSlack` → `POST /slack/:id/approved {txHash}` |
| `(tabs)/risk` | Positions, liquidation distance bars, exposure by market, weekly loss vs limit gauge, funding paid, PnL sparkline | gateway `/risk`; Envio `PnlSnapshot` | Refresh ≤ 5s |
| `(tabs)/traders` | "Hire a trader": Falcon/Otter/Owl `TraderCard`s, ERC-8004 link | API `/traders`, Envio | Selecting a trader feeds the rules flow (`persona`) |
| `(tabs)/spot` | Swap dollars ↔ MON with order-book depth | Prem's Kuru helper | User-signed swap |
| `trade` (quick action) | Manual Perpl market order | gateway `/orders/prepare` | User-signed (required by the Agora bounty) |

**Kill switch:**
1. `PullLeashButton` → Face ID → `MandateRegistry.pause(user, "user")`.
2. `POST /agent/kill`.
3. Home shows PAUSED and a "Resume" action (user-only `resume()`).

---

## 7. Execution plan (America/Phoenix time)

### Hour 0 (now → CP0, Sun 23:00): de-risk passkeys before any UI
1. Agree on the **domain** with the team (e.g. a Vercel project you control).
2. Host the passkey association files on it, per the Mera React Native guide:
   - `/.well-known/apple-app-site-association` (`webcredentials.apps: ["<TEAMID>.<bundleId>"]`)
   - `/.well-known/assetlinks.json` (`delegate_permission/common.get_login_creds` + your signing cert SHA-256)
3. Expo app with `ios.associatedDomains: ["webcredentials:<domain>"]`, `ios.bundleIdentifier`, `android.package`. Build a **development build** (EAS or local `npx expo run:ios` on a Mac); Expo Go won't work.
   - iOS needs Deep's paid Apple Developer team.
   - If there isn't one, use Android with Google Password Manager passkeys.
4. Implement `lib/mera.ts`: `createAccount()`, `signIn()`, `withSigner(fn)` (prompt-per-transaction). Derive the BIP-44 key from `prfOutput` exactly as the Mera guide shows.
5. Sign and send a 0-value tx on **testnet 10143** with an explicit gas limit.
6. **CP0 exit:** an address on screen and a testnet tx hash. Post it in team chat.

**Fallback:** blocked after 2h → an installable mobile PWA (Next.js) using Mera web on the same domain. Tell the team immediately; it weakens the "mobile app" claim, so native is strongly preferred.

### CP1, Mon 12:00 (all on mocks)
- Monorepo wiring: Metro `watchFolders` for `packages/shared`; TS path aliases.
- `theme.ts`, fonts, and the five signature components, with a hidden `/dev/components` screen showing them all.
- Onboarding, Home (ring + chip + mini cards + pull button), Rules writer + Leash Card on fixtures.
- Typed clients:
  - `lib/api.ts` (`EXPO_PUBLIC_API_URL`)
  - `lib/gateway.ts` (`EXPO_PUBLIC_GATEWAY_URL`)
  - `lib/envio.ts` (`EXPO_PUBLIC_ENVIO_URL`, graphql-request + `queries.graphql`)
  - `lib/chain.ts` (viem public client, `monad`)
  - all wrapped in `@tanstack/react-query` with 2–5s polling
- `lib/verify.ts`: recompute and compare `reasonHash`; unit-test it with a fixture receipt from Prem.

### CP2, Mon 20:00: first real trade, on live endpoints
- Perpl setup (deposit + key authorization).
- Sign the Leash Card on **143** → `POST /agent/activate`.
- Receipts feed from Envio + receipt detail with a **live ✓**.
- One manual Perpl trade from the `trade` quick action.

**Exit:** Falcon's live trade appears in the feed and verifies on the phone.

### CP3, Tue 08:00: feature freeze
- Slack sheet: push → open → approve with Face ID → executed receipt shows "Slack 5x until …".
- Risk view, Traders, Spot swap, Kill switch + Resume.
- Empty, loading and error states for every screen; haptics on sign / approve / pull.

### Ship (Tue, ≥ 2h before cutoff)
1. Record each screen as soon as it works (iOS screen recording).
2. Assemble the **2-minute video** following the briefing's script:
   - 0:00 hook
   - 0:12 Face ID sign-up
   - 0:28 rules → Leash Card
   - 0:45 live trade ✓ + DENIED 5x
   - 1:05 slack approval
   - 1:22 Referee pause + kill switch
   - 1:40 traders + five-knot diagram + why Monad
3. Export 6 screenshots.
4. Confirm the exact submission cutoff and form fields on hackathon.monad.xyz (**Q9**) and post them in team chat.

---

## 8. Interfaces with teammates

| You need | From | When |
|---|---|---|
| Schemas, `canonical.ts`, `sendTx.ts`, fixtures | Prem | CP0 |
| `API_URL`, push payload format, Kuru swap helper | Prem | CP1 / CP3 |
| ABIs, `addresses.ts`, `queries.graphql` + Envio fixtures, gateway OpenAPI + mock | Yadnesh | CP0 |
| `GATEWAY_URL` live, `ENVIO_URL` live | Yadnesh | CP1 / CP2 |

| You give | To | When |
|---|---|---|
| The domain + bundle id / package name | everyone | Kickoff |
| A test user address with a signed mandate | Prem, Yadnesh | CP2 |
| Video + screenshots, cutoff time + form fields | everyone | Ship / tonight |

## 9. Environment (`apps/mobile/.env.example`)
```
EXPO_PUBLIC_USE_MOCKS=true
EXPO_PUBLIC_CHAIN_ID=143
EXPO_PUBLIC_RPC_URL=https://rpc.monad.xyz
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_GATEWAY_URL=
EXPO_PUBLIC_ENVIO_URL=
EXPO_PUBLIC_PASSKEY_RP_ID=<team domain>
```

## 10. Checkpoint status report (post in team chat at CP0–CP3)
```
FACE · CP<n> · <time>
Done: …
Works on device: …   (attach a screen recording)
Live or mock: …
Blocked / stubbed: … (see docs/LIMITATIONS.md)
Need from Prem/Yadnesh: …
Next: …
```

## 11. Definition of done
- Face ID onboarding works on a real phone; no seed phrase anywhere.
- Every screen in §6 works on live data, with empty, loading and error states.
- Receipt ✓ is computed on device and fails visibly on mismatch.
- Slack approval, kill switch and resume work on mainnet.
- Visuals match §5 tokens and components.
- The 2-minute video and 6 screenshots are delivered; the cutoff time is confirmed.
