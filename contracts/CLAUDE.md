# contracts/ — agent notes

The Rules + Receipts knots of LEASH. Solidity 0.8.28, Foundry.

- Interfaces `src/interfaces/*.sol` are **frozen** (ARCHITECTURE §7.1).
  Implement exactly; don't change without team agreement.
- No owner, no upgradeability, no backdoor. Only privileged party is the
  immutable `referee`, and it can *only pause*. Judges read these.
- `foundry.toml`: `via_ir = true`, `metadata = true`, `metadata_hash = "none"`,
  `use_literal_content = true` (needed for Sourcify/Monadscan verification).
- forge-std defines a `struct ReceiptLog`; our contract shares the name, so in
  tests/scripts import it aliased: `import {ReceiptLog as ReceiptLogContract}`.
- Run `forge test` (31 tests). Export ABIs with `script/export-abis.sh` →
  `packages/shared/abis/`, then regenerate `abis/index.ts`.
- Deploy: `script/Deploy.s.sol` (testnet 10143 first, then mainnet 143). Smoke
  with `script/Smoke.s.sol`. Verify on both explorers. Ask Yadnesh before the
  first mainnet deploy. Record addresses in `packages/shared/addresses.ts`.
- Every tx sets an explicit gas limit (Monad charges on the limit).
- ERC-8004 persona registration lives in `script/erc8004/` (Agent0 SDK).
