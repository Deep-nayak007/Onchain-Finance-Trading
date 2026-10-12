# LEASH workspace

Read ARCHITECTURE.md completely; it is the source of truth.
The three lanes are Brain, Rails, and Face. Read your brief in briefs/.
Do not change frozen architecture §7 silently.
Face owns apps/mobile. Brain owns services/api, guardian, and shared helpers.
Rails owns contracts, gateway, indexer, shared ABI/address/query files.
This initial Face build has no shared package or deployed services.
Bootstrap data stays in apps/mobile/demo and never becomes live proof.
Default USE_MOCKS=true. Every screen must visibly distinguish sample data.
Import the real shared canonical function and sender before live acceptance.
Never invent deployed addresses, ABIs, enrollment payloads, or indexer fields.
All user transactions require review, a fresh passkey prompt, explicit gas, and receipt confirmation.
Never persist PRF or signing keys. Never upgrade user EOAs with EIP-7702.
Mainnet chain is 143; the separate testnet proof is 10143.
Private secrets belong in untracked .env files. Do not log keys.
Track team dependencies and unproven acceptance in docs/LIMITATIONS.md.
Use npm workspaces and strict TypeScript; prefix shell commands with rtk on Deep's machine.
Build iOS through ios:cached when working from a synced Desktop folder.
Do not deploy, submit, or send teammate messages without an explicit request.
