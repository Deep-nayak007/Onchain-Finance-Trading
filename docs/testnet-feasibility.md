# Testnet (10143) feasibility probe: Phase 0 (2026-10-12, read-only)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | Perpl testnet contracts | ✅ exchange `0x1964C32f…80cc` has code (225 B proxy); collateral `0xa9012a05…22dC` has code | `cast code` on 10143; matches `perpl-sdk Chain::testnet()` (block 62953) and docs.perpl.xyz networks page |
| 1b | Testnet collateral token | AUSD, 6 decimals, totalSupply ≈ 1.302B. Exchange confirms it: `getExchangeInfo()` → collateral `0xa9012a…22dC` | `cast call` symbol/decimals/totalSupply; viem `getExchangeInfo` |
| 1c | How to get test AUSD | ❌ **No public path found.** No `mint` selector in bytecode, `mint` reverts; no faucet in docs/API context. "Test USD" `0xdf5b…c027` **is** publicly mintable but is **not** the exchange's collateral. Min account open = **100 AUSD**, min deposit 10 AUSD | bytecode/eth_call; `GET testnet.perpl.xyz/api/v1/pub/context`; PerplFoundation/api-docs issue #17 |
| 2a | Perpl testnet markets | ✅ 8 open markets: BTC 16, ETH 32, SOL 48, **MON 64**, ZEC 256, LIT 272, PUMP 320, NEAR 336. MON mark/oracle 0.02505, fresh timestamps | REST pub/context; `getPerpetualInfoV2(64)` |
| 2b | Liquidity (MON perp) | ✅ Deep both sides: ~4–6M MON per level (≈$100k+); bids 0.02473–0.02497, asks 0.02505–0.02533. OI ≈ 2.84M MON/side. A $10–25 IOC order fills | `getVolumeAtBookPrice(64, p)` multicall |
| 2c | Gateway on testnet | ⚠️ Code supports it (`cache.rs`: `CHAIN_ID != 143 → Chain::testnet()`), market name resolves `MON-PERP` → symbol `MON`. **Not run locally**: no Rust toolchain on this Mac (needs 1.94.1) | `services/perpl-gateway/src/{config,cache,perpl}.rs` |
| 3 | Trade-only key | Perpl's real delegation is **API keys** (Ed25519, enrolled with an EIP-712 wallet signature, optional `target_profile` operator, validated onchain); "Withdrawals and transfers-out are never permitted via an API key". That's an offchain REST path. The onchain Exchange has **no operator/delegate function** (only `allowOrderForwarding`, `createAccount`, `depositCollateral`, `withdrawCollateral`). Rails' gateway signs `execOrdersV2` itself, so it must own the account → **fallback: demo Perpl account owned by the agent trade key**, funded with test AUSD | docs.perpl.xyz api/authentication; Exchange ABI from dex-sdk |
| 4a | Kuru testnet liquidity | ✅ BUY only (spend USDC → MON): $5 → 4.995 MON. ❌ SELL: no bids | `Kuru.quote()` on MON/USDC `0xa241…D2D9` |
| 4b | Testnet USDC for Kuru | ❌ Kuru's testnet USDC `0x3bA3…1570` has no public mint/faucet. Circle's faucet USDC on Monad testnet is a **different** token (`0x534b…43A3`). Mainnet Kuru uses Circle USDC `0x7547…b603` | bytecode/eth_call; developers.circle.com USDC addresses |
| 5 | ERC-8004 on 10143 | ✅ Identity `0x8004A818…BD9e` and Reputation `0x8004B663…8713` have code (130 B proxies), already in `addresses.ts` (`ERC8004_TESTNET`) | `cast code` |
| 6 | Testnet gas | gas tank 3.189 MON · referee 0.993 · Falcon persona 0.200 · Otter 0.193 · **Owl 0.000** (its drip **reverted**, status 0) · test-user agent wallet 0.177 | `cast balance`; receipt `0x84e1…8112` status 0x0 |

Bug found: `gas/drip.ts` returns the hash without waiting for the receipt, so the reverted Owl drip was reported as success. Fix = confirm by receipt (`sendTxAndWait`), release the claim on revert.
`PERSONA_WALLETS` is set on Fly but not in the local `services/api/.env`.

## Recommendation: **PARTIAL** for real Perpl testnet trades
Everything is ready (markets live, deep liquidity, gateway already chain-aware, contracts + ERC-8004 on testnet, gas OK) **except
test collateral**: a real trade needs ≥ 100 testnet AUSD (`0xa9012a…22dC`) in an account owned by the agent trade key.
→ **GO as soon as someone sends ~150 test AUSD** (ask the Perpl team / bounty channel; they hold the supply). Until then:
paper mode + onchain receipts (already proven), and the gateway can still serve real testnet `/markets` and `/book`.
Kuru real swap is **NO-GO on testnet** unless Kuru provides testnet USDC; the `/spot/prepare` quote path works.
