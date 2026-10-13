# Testnet demo plan (Monad 10143): who does what

Decision (2026-10-12): the whole demo runs on **Monad testnet (10143)**. No mainnet deploy now. Mainnet stays a config-only switch.
Brain status: API live at `https://leash-brain-api.fly.dev` (chain 10143, paper), proven end to end. See `docs/testnet-evidence.md`.

## Status (2026-10-12, evening)
- ✅ **Gateway live on testnet**: `https://leash-perpl-gateway.fly.dev` (Brain hosted Rails' code on Fly; deploy file only, logic untouched).
  Wired into the Brain API (`GATEWAY_URL`). Health ok, 15 perps, deep MON book, real `/risk`.
- ✅ **Indexer is Envio-Cloud-ready** on branch `envio` (c0450de): ABIs inside `indexer/`, Kuru testnet market, persona wallets,
  BigDecimal fix; verified locally against testnet.
- ✅ **Envio Cloud source repo (fallback)**: https://github.com/prempagare07/leash-indexer (Prem-owned, `git subtree split` of `indexer/`,
  history kept, pnpm 10.32.0 lockfile). The monorepo's transferred ownership blocked the Envio GitHub app for collaborators.
  Envio Cloud: root `./`, config `config.yaml`, branch `envio`. Re-sync after indexer changes (from the monorepo root):
  `git subtree split --prefix=indexer origin/envio -b indexer-split && git push https://github.com/prempagare07/leash-indexer.git indexer-split:envio`
  (drop `deploy/` as in the first standalone commit if needed). ⏳ Remaining: Prem installs the Envio app on that repo + adds the indexer.
- ✅ **ERC-8004 on testnet**: Falcon #2227, Otter #2228, Owl #2229 on IdentityRegistry `0x8004A818…BD9e`; agentURI served by the Brain API
  (`/agents/<persona>.json`). In `addresses.ts` PERSONAS.
- ℹ️ Rails also runs a **mainnet** gateway on Render (`https://leash-gateway.onrender.com`, `SERVICES.gatewayUrlMainnet`).
- ⏳ **Perpl testnet AUSD** (~150) from the Perpl team for a live order.

## Rails (Yadnesh)
1. ✅ **DONE by Brain** (`https://leash-perpl-gateway.fly.dev`, `services/perpl-gateway/fly.toml`, STALE_BLOCKS_MAX=50). Original spec, for reference:
   ```
   CHAIN_ID=10143
   MONAD_RPC=https://testnet-rpc.monad.xyz
   MANDATE_REGISTRY_ADDRESS=0x81bbeaf263eeae41cfd4be137427af3ba7248467
   MARKET_ALLOWLIST=MON-PERP
   MAX_ORDER_USD=25
   ```
   `cache.rs` already picks `Chain::testnet()` when `CHAIN_ID != 143`, and `find_perp` maps `MON-PERP` → testnet symbol `MON` (perp id 64).
   Deploy it (Fly/Railway) and send `GATEWAY_URL`.
2. **Envio Cloud on testnet: checklist** (official: docs.envio.dev/docs/HyperIndex/hosted-service-deployment; requires
   envio ≥ 2.21.5, not 2.29.x (we're on 3.14.0 ✓), pnpm 10.32.0-compatible, repo < 100 MB ✓, **all imports inside the indexer root**):
   a. GitHub (yashpy) → Settings → Applications → Installed GitHub Apps → **Envio Deployments** → Configure → grant
      `Onchain-Finance-Trading` (the repo was transferred, so the old grant doesn't apply).
   b. **Make the indexer self-contained** (your code): copy `packages/shared/abis/{MandateRegistry,ReceiptLog}.json` into
      `indexer/abis/` and change both `abi_file_path` in `indexer/config.yaml` to `./abis/...`. Optional: commit an
      `indexer/pnpm-lock.yaml` (`cd indexer && pnpm install --ignore-workspace`).
   c. Envio dashboard: delete the stale `leash-monad` indexer, re-add it on `yashpy/Onchain-Finance-Trading` with **root dir `indexer`**,
      config `config.yaml`, **branch `envio`** (CLI: `pnpx envio-cloud indexer add --name leash-monad --repo Onchain-Finance-Trading`
      + root/config/branch flags, after `envio-cloud login`).
   d. Merge `main` into `envio`, push → watch the deployment (`envio-cloud deployment status … -o json`) → send `ENVIO_URL` (GraphQL).
   Then also index: MandateRegistry + ReceiptLog (start block 70331260), and add the **Perpl testnet exchange**
   `0x1964C32f0bE608E7D29302AFF5E61268E72080cc` (from block **62953**) and the **Kuru testnet MON/USDC market**
   `0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9` (base MON 18 dec, quote USDC 6 dec, pricePrecision 1e8, sizePrecision 1e10).
   Fill `PERSONA_WALLETS` in `EventHandlers.ts`: Falcon `0x2477150BBA80a4E9127151eB863892f346211994`,
   Otter `0x1780E260D175e975c6FFD31ed1FfaE9b6e7D0FB6`, Owl `0x38581aaaf757d195e2343651Ada5E7cE58F9d22C`. Send `ENVIO_URL`.
3. **addresses.ts**: Brain added `PERPL_TESTNET` (sdk `Chain::testnet()`, bytecode-checked). Please review/own it; also fill `PERSONAS`
   with the three wallets above. Optional: export the full Perpl Exchange ABI into `packages/shared/abis` (Brain uses a verbatim
   fragment in `services/api/src/exec/perpl-abi.ts` until then).
4. **ERC-8004 on testnet**: Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e` exists on 10143 (code checked). Register the three
   personas there and send the `agentId`s.
5. **Live order (optional, needs collateral)**: Perpl testnet collateral is AUSD `0xa9012a…22dC` (no public mint; min account open
   100 AUSD). If you can get ~150 test AUSD (Perpl team), fund a demo account owned by the agent trade key; Prem then flips `LIVE=true`.
   `/deposit/prepare` needs `createAccount(amountCNS)` / `depositCollateral(amountCNS)` (Exchange ABI).
6. **No mainnet deploy needed now.**

## Face (Deep)
1. `apps/mobile/.env`:
   ```
   EXPO_PUBLIC_USE_MOCKS=false
   EXPO_PUBLIC_CHAIN_ID=10143
   EXPO_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
   EXPO_PUBLIC_API_URL=https://leash-brain-api.fly.dev
   EXPO_PUBLIC_GATEWAY_URL=   # when Rails sends it
   EXPO_PUBLIC_ENVIO_URL=     # when Rails sends it
   ```
2. Accept chain **10143** (`requireMainnet()` and `txRequestSchema.chainId`); see `docs/FACE_LIVE_HANDOFF.md` items 1–4.
3. Label the network **"Monad testnet"** in the UI (header/settings) and paper receipts (`execTxHash: null`) as "paper".
4. Test wallet funding: new account → `POST /gas/drip {account}` (0.2 testnet MON, once per address, confirmed by receipt).
   More MON: faucet.monad.xyz / faucet.quicknode.com/monad. Perpl collateral: see Rails item 5 (no public faucet).
5. First live check: `GET /receipts/0x86e8ca275306825cbd9aed2c7d4dd40bc4a71f055823dd712cec166e70bb75c1` → ✓, `usedSlack`, 0.9 s.

## Brain (Prem): done / next
- Done: API on testnet with live Perpl markets, receipts, slack, kill/resume, Referee; drip fix; demo policy without smart money.
- Next: set `GATEWAY_URL`/`ENVIO_URL` on Fly when Rails sends them (ask Prem first):
  `fly secrets set GATEWAY_URL=<url> ENVIO_URL=<url> --app leash-brain-api` (keeps `CHAIN_ID=10143`, `LIVE=false` from fly.toml).
- `LIVE=true` only after collateral + gateway, and only on Prem's explicit go.
