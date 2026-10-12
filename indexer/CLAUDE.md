# indexer/ — agent notes

Envio HyperIndex v3 for `MandateRegistry` + `ReceiptLog` on Monad (chain 143).

- Entities are frozen (ARCHITECTURE §7.5): `schema.graphql`. Queries + response
  fixtures in `packages/shared/queries.graphql` and
  `packages/shared/fixtures/envio/`.
- Scaffold origin: `pnpx envio@3.0.0-rc.0 init template -t erc20 -l typescript
  -d ./indexer --api-token ""`, then the erc20 contracts were swapped for ours.
- `config.yaml` points at `../packages/shared/abis/*.json`. Fill in the real
  contract addresses and `start_block` from `addresses.ts` after the CP1
  deploy (currently placeholders).
- Handlers (`src/EventHandlers.ts`): all five MandateRegistry events +
  `TradeReceipt`. `Receipt.id = ${txHash}-${logIndex}`. `Agent` keeps
  executed/rejected/shadow counts and volumeUsd.
- **Shadow counting is persona-gated**: only count a SHADOW receipt when its
  emitter is in `PERSONA_WALLETS` (fill from `addresses.ts` PERSONAS at CP1).
- Perpl fills + Kuru trades → `PerplFill`/`KuruTrade` and the PnL fields land at
  CP3 (ABIs from perpl-sdk / Kuru docs; Kuru addresses are Q3 from Brain).
  PnL method is documented in `docs/pnl.md`.
- Dev: `pnpm codegen && pnpm dev`. Deploy to Envio Cloud: install the GitHub App,
  push to the `envio` branch, `pnpx envio-cloud login`, then
  `pnpx envio-cloud indexer add --name leash-monad --repo <repo> --branch envio
  --yes`. Put the GraphQL URL in `addresses.ts` → `SERVICES.envioUrl`.
- Docs MCP: `claude mcp add --transport http envio-docs https://docs.envio.dev/mcp`.
