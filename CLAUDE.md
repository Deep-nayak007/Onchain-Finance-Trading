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

This repo currently contains the **RAILS** lane, authored by Yadnesh.
