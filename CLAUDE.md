# LEASH — root agent notes

Read `ARCHITECTURE.md` first. It is the source of truth; if a lane brief
conflicts with it, ARCHITECTURE.md wins. Follow §9 "Rules for every coding
agent".

- Lanes: **Brain** (`services/api/`, `guardian/`, `packages/shared/`),
  **Rails** (`contracts/`, `services/perpl-gateway/`, `indexer/`,
  `packages/shared/abis`, `packages/shared/addresses.ts`), **Face**
  (`apps/mobile/`).
- Lane briefs live in `briefs/`.
- Never invent addresses, ABIs, endpoints or SDK functions. Addresses live
  only in `packages/shared/addresses.ts` with a source URL; check bytecode on
  chain 143 before use.
- Frozen interfaces: ARCHITECTURE §7. Don't change silently.
- Monad gas: every tx sets an explicit gas limit (estimate + ~10%).
- Secrets live in `.env` only; commit `.env.example`; never log keys.
- Small, descriptive commits. Rails works on branch `rails`.
- Blocked > 45 min → stub behind the interface, note in `docs/LIMITATIONS.md`.

## Package managers
- pnpm workspace for `packages/*`, `services/*`, `guardian`, `indexer` (`pnpm install && pnpm test`).
- `apps/mobile` uses **npm workspaces** (root `package-lock.json`; `npm install`, `npm run test:mobile`). It is excluded from the pnpm workspace so Expo/React Native resolution isn't changed.

## Face notes (apps/mobile)
- Bootstrap data stays in apps/mobile/mocks and never becomes live proof.
- Default USE_MOCKS=true. Every screen must visibly distinguish sample data.
- Import the real shared canonical function and sender before live acceptance.
- Never invent deployed addresses, ABIs, enrollment payloads, or indexer fields.
- All user transactions require review, a fresh passkey prompt, explicit gas, and receipt confirmation.
- Never persist PRF or signing keys. Never upgrade user EOAs with EIP-7702.
- Mainnet chain is 143; the separate testnet proof is 10143.
- Private secrets belong in untracked .env files. Do not log keys.
- Track team dependencies and unproven acceptance in docs/LIMITATIONS.md.
- Use npm workspaces and strict TypeScript; prefix shell commands with rtk on Deep's machine.
- Build iOS through ios:cached when working from a synced Desktop folder.
- Do not deploy, submit, or send teammate messages without an explicit request.
