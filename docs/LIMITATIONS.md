# Limitations, stubs and missing inputs

Owner of each line in brackets. Updated at every checkpoint.

## Missing addresses (never invented; `packages/shared/src/addresses.ts` stays null until Rails commits verified ones)
- [Rails] `MandateRegistry` and `ReceiptLog` (testnet 10143 and mainnet 143)
- [Rails] Perpl exchange contract and collateral token (Q2: AUSD?)
- [Rails] ERC-8004 identity registry (Q5) and the three trader `agentId`s
- [Brain] Kuru router + MON/AUSD market (Q3)
- [Brain] Persona wallets (Falcon / Otter / Owl) — created at CP1 via Privy
- Known and not yet in `addresses.ts`: Referee `0xFad2FFf6024214711Dc3A6521F40e5871A779a44` (Rails to add with source)

## Stubs at CP0
- `packages/shared/abis/index.ts`: empty `as const` ABIs, typed for viem. [Rails replaces with exported ABIs]
- Fixtures (`packages/shared/fixtures/`): every address (`0x000…`), `agentId` (1/2/3), tx hash and price is a
  PLACEHOLDER. Hashes (`reasonHash`, `signalHash`, `policyHash`) are real and recompute with `canonical.ts`.
- `TxRequest.chainId` accepts 10143 (testnet) as well as 143 while we build on testnet.

## External services
- Tenderly: not available; simulation is skipped when `TENDERLY_ACCESS_KEY` is empty.
- Alchemy simulation on Monad: unknown (Q6); no simulation unless confirmed.
- LLM: Qwen via OpenAI-compatible API, JSON mode only (no tool calling); deterministic fallback on failure.
