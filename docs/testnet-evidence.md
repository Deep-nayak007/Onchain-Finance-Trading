# Brain on Monad testnet: evidence (2026-10-12)

All on chain **10143** against Rails' deployed contracts (MandateRegistry `0x81bb…8467`, ReceiptLog `0x21b1…d6b3`),
`LIVE=false` (paper: no venue orders), gateway = Rails' mock JSON, LLM = Qwen, wallets = Privy.
Explorer: `https://testnet.monadexplorer.com/tx/<hash>`.

Test user (throwaway key): `0xE7f1FFcC13C1384a2a1d7eaC19edF0F69e85f4FD` · Falcon agent wallet (Privy, policy-locked): `0xf9C5607524cE71B93c0d4f3E52cA5935bD02C4CC`

| # | Step | Who signs | Tx |
|---|---|---|---|
| 1 | `POST /gas/drip` → test user (0.2 MON, explicit gas 21000); second drip → 409 | gas tank | `0x157026d78d4b2bd01d35706870ed15a493949821b062de8a60bf0daad6b20665` |
| 2 | `POST /mandate/compile` (Qwen) → policy + Privy `agentWallet`; user signs `setMandate` | user | `0xa25e90414db47167d3d748369ceef51f8a08392b8647f00213b91e366511c685` |
| 3 | Drip to the agent wallet (pays for `logReceipt`) | gas tank | `0x2e7236fca84a545afc7471fd8d381fc63f124f5d888ab7bcbb7ea7fe7365b714` |
| 4 | `POST /agent/activate`: Brain checks mandate + `agentWallet` onchain; Falcon loop runs (real Qwen ticks → HOLD) | — | — |
| 5 | REJECTED receipt `NO_SMART_MONEY_AGREEMENT` (Nansen has no Monad data) · reasonHash `0xb8c0…ebc6` · 1397 ms | Privy agent wallet | `0xa8561d85569f97a9d552cfaeb888c9735da33943ef312ff86010caa5145700e2` |
| 6 | Re-compile (no smart-money rule), user re-signs `setMandate` | user | `0x860cc54af18e49e79cf4423c64b0059f42fe1b64069474376a4997fbf87684eb` |
| 7 | 5x on $15 at 0.9 confidence → REJECTED `LEVERAGE_EXCEEDS` + **slack request** (5x/$20/60 min/$1.50 extra risk) · reasonHash `0x33ec…dad6` | Privy agent wallet | `0xf577a86ac08348c1d6ab57344a9bf95b36cea168c67153b7b9eb5e3bc42de9b1` |
| 8 | User approves: `grantSlack(50, 20e6, 1.5e6, now+3600)` | user | `0x1a1e675ea11fe2723385ee7390fd5a30f70b7ec8188d201044387a54221f2da6` |
| 9 | `POST /slack/:id/approved` → re-check → **EXECUTED (paper), `usedSlack = true`** · reasonHash `0x215d…41e4` · 1030 ms; phone hash check ✓ | Privy agent wallet | `0xbf82d390a6b0402d4ab7895e10ceb6d5a0a68130c16647323a402c837b813108` |
| 10 | Pull the leash: user signs `pause(user,"user")`, `POST /agent/kill` → KILLED, Privy deny-all, gateway key disabled | user | `0x2c1363f20149699b148b405b89a59c67193ee93e4e9eca5c0ec297742b43b27a` |
| 11 | Persona wallets created (logShadow-only policy) + funded: Falcon `0x2477…1994`, Otter `0x1780…0FB6`, Owl `0x3858…d22C` | gas tank | `0x9557…d314`, `0x8e17…d2e5`, `0x84e1…8112` |
| 12 | Otter SHADOW call via `logShadow` · reasonHash `0x3797…9c51` · 1518 ms | Otter persona wallet | `0x6286ec89925e4939c21783b2d7c30fddb52645831a7c63df1e9f5a6c19365214` |
| 13 | User `resume()` | user | `0x6485b7034736831908972e29e68da95891ff786e6176edc946f4df040a5d610b` |
| 14 | **Referee**: CRE sim reads mandate on monad-testnet + gateway (demo breach −12.4% vs −5%) → executor `pause(user,"referee:weekly_loss")` | referee key `0xFad2…9a44` | `0x7413c660f14157fccd47f0fc63a6319f851d89968c5b7a9f1b2c79cba704115a` |

Also proven:
- **Privy policy engine** (live): allows `logReceipt` and transfer-to-user; refuses transfer-to-stranger, unknown contracts, the wrong chain, and everything after deny-all (`services/api/test/privy.integration.test.ts`).
- **Kuru** (read-only on 10143): market params + quote for MON/USDC; `/spot/prepare` builds approve + `placeAndExecuteMarketBuy` with buffered gas. Testnet book has no bids, so SELL is refused (no `minOut = 0` orders).
- **Docker**: `services/api/Dockerfile` builds and serves `/health` (smoke-tested 2026-10-12).

Reproduce: `services/api/scripts/paper-intent.ts`, `services/api/scripts/persona-wallets.ts`, `guardian/scripts/demo-gateway.ts` + `guardian/src/executor.ts --once`.
