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

## Run 2: against the deployed API `https://leash-brain-api.fly.dev` (2026-10-12, testnet, paper)
Live Perpl testnet prices read onchain (MON mark $0.02486 in the signals). Falcon policy: 1x, $20/trade, no smart-money rule.
Agent wallet (Privy, created by the deployed API): `0xA3edb9Cb824721B128c8762a68d55ab56b8Ce680`.

| # | Step | Tx |
|---|---|---|
| 1 | Owl persona re-funded (its first drip had reverted; drip now confirms by receipt) | [https://testnet.monadvision.com/tx/0xbeccf26f…98cd](https://testnet.monadvision.com/tx/0xbeccf26f4892a8674d8d8055f56c33a5e48e057ea1a1faee330f1f89c04398cd) |
| 2 | User signs `setMandate` (deployed agentWallet; clears the earlier Referee pause) | [https://testnet.monadvision.com/tx/0x7bdb742c…64a9](https://testnet.monadvision.com/tx/0x7bdb742c40437f36a21d39f5b4dadf3ceec24e95d2d6bc02d0ded6aff46264a9) |
| 3 | `POST /gas/drip` (deployed) → agent wallet, Face's `{account}` body | [https://testnet.monadvision.com/tx/0x22262d41…66e3](https://testnet.monadvision.com/tx/0x22262d4102707c8fbf140cf9f7d09e70a8d05aa82611e72417810b6d6a3266e3) |
| 4 | 5x on $15 vs 1x limit → **REJECTED `LEVERAGE_EXCEEDS`** + slack request · reasonHash `0x1aa52fe3…56ec` · 1010 ms | [https://testnet.monadvision.com/tx/0xd109ef3d…8883](https://testnet.monadvision.com/tx/0xd109ef3dbafc5d22399260951f3ce517e17372f6f74fbb9ddf7f6d3c72a48883) |
| 5 | User signs `grantSlack(5x, $20, $1.50, 1h)` | [https://testnet.monadvision.com/tx/0xcf8a1d6c…6b1f](https://testnet.monadvision.com/tx/0xcf8a1d6c0a13ce83607ae4708480f186beef001f35fc93d0771baf696c2d6b1f) |
| 6 | `/slack/:id/approved` → re-check → **EXECUTED (paper), `usedSlack = true`** · reasonHash `0x86e8ca27…75c1` · **886 ms** | [https://testnet.monadvision.com/tx/0x8d35d96b…69e4](https://testnet.monadvision.com/tx/0x8d35d96b72148be12f25514366f98fc63c26970ad310ad24bee0dfd0f30869e4) |
| 7 | Pull the leash: `pause(user,"user")` → `/agent/kill` → KILLED; ticks stop; intent refused ("not running") | [https://testnet.monadvision.com/tx/0x0465b5f8…80e6](https://testnet.monadvision.com/tx/0x0465b5f820d6c5bb555f3dfd086758e4cbf96d62444f4ca71425b87066da80e6) |
| 8 | `resume()` → `/agent/activate` → RUNNING (Privy policy restored) | [https://testnet.monadvision.com/tx/0xa3b64e76…c726](https://testnet.monadvision.com/tx/0xa3b64e76393a0bd67208b946cf38ba245b08be294c0be8426703264c5f36c726) |
| 9 | **Referee**: CRE sim (BREACH −12.4% vs −5%) → executor `pause(user,"referee:weekly_loss")` from the referee key; engine sees PAUSED | [https://testnet.monadvision.com/tx/0x9c96ad18…3960](https://testnet.monadvision.com/tx/0x9c96ad18b4f4be9b2de27311e313a14d289b4b0d082bbb1c4f0d87a2bc5d3960) |
| 10 | `resume()` + activate → demo user left RUNNING on the deployed API | [https://testnet.monadvision.com/tx/0x1e5487f0…1f51](https://testnet.monadvision.com/tx/0x1e5487f02249eca439fc1bd7ea714e7f6836e1e721f3565cb95228d2efcb1f51) |

Phone check: both receipts fetched from the deployed `GET /receipts/:reasonHash` recompute with `@leash/shared/canonical` → ✓.
Steps 4 and 6 used the token-guarded paper `POST /demo/intent` (`model = "manual-paper-test"`) because MON is flat on Perpl testnet
and the LLM (correctly) holds; the checker, receipt, slack and execution path is identical to an LLM decision.
Not done (blocked): live Perpl order (`LIVE=true`) needs ≥ 100 testnet AUSD + Rails' gateway; real Kuru swap needs Kuru's testnet USDC
(see docs/testnet-feasibility.md).

## Run 3: real Perpl gateway on testnet (2026-10-12 evening)
Brain API now uses `https://leash-perpl-gateway.fly.dev` (Rails' gateway): markets + `/risk` come from the gateway's live Perpl
snapshot. Paper intent for the demo user → **EXECUTED (paper)**, snapshot mark **$0.02459** from the gateway, receipt confirmed
**1033 ms** after the decision, `GET /receipts/:reasonHash` → ✓ with `@leash/shared/canonical`:
reasonHash `0xd4ccad748eb04b4624f665f86c3efcf150a88887d9ceed8721456918075e8483` ·
[https://testnet.monadvision.com/tx/0xc7412d7885eb55be7ac168e6b5106331fa62e140e67b7a40d9b4074b2369864b](https://testnet.monadvision.com/tx/0xc7412d7885eb55be7ac168e6b5106331fa62e140e67b7a40d9b4074b2369864b)
Referee `--once` against the deployed gateway's `/risk`: `ok` (weekly 0% vs −5% limit).

## ERC-8004 identities on testnet (2026-10-12)
Registered on IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e` by the gas tank, agentURI served by the Brain API:
| Persona | agentId | Register tx | Card |
|---|---|---|---|
| Falcon | 2227 | [https://testnet.monadvision.com/tx/0x954b8e92…005c](https://testnet.monadvision.com/tx/0x954b8e92ecbaf4fc866a5d02c15eabd88a133d6c802ecca4be8b8c3652a3005c) | https://leash-brain-api.fly.dev/agents/falcon.json |
| Otter | 2228 | [https://testnet.monadvision.com/tx/0x0052a0a6…4140](https://testnet.monadvision.com/tx/0x0052a0a606a2133dcb47d3e13eadd68481591ba95b9b0c87e655b9a4876d4140) | https://leash-brain-api.fly.dev/agents/otter.json |
| Owl | 2229 | [https://testnet.monadvision.com/tx/0xa366ba97…5467](https://testnet.monadvision.com/tx/0xa366ba97890e107dbb572ea090913d08245e584b1b2cbb2974eb14ad47065467) | https://leash-brain-api.fly.dev/agents/owl.json |

## Run 4: full stack on testnet, gateway + Envio + ERC-8004 (2026-10-12 night)
Brain API → real gateway (`leash-perpl-gateway.fly.dev`, `/keys/prepare` now returns the per-user trade key) → onchain receipt →
Envio (`https://add-bush-herbal-raid.trycloudflare.com/v1/graphql`) → Brain `/traders`.
| Step | Result | Tx |
|---|---|---|
| Compile → agentId **2227** (Falcon's ERC-8004 id), Privy agentWallet, real `perplKey` 0xa097…eefc from the gateway | ok | — |
| User signs `setMandate` with agentId 2227 + gateway trade key | ok | [https://testnet.monadvision.com/tx/0xe45bff67…](https://testnet.monadvision.com/tx/0xe45bff67b767f05ee4efbc3000e72bf394812f768bbf90c6aa7ce3f6df102564) |
| Paper intent → **EXECUTED** receipt, gateway mark $0.02486, **639 ms** decision→confirmed, `GET /receipts` ✓ | reasonHash `0xd8b7b0c3…` | [https://testnet.monadvision.com/tx/0x6812046a…](https://testnet.monadvision.com/tx/0x6812046a7d53b5ca99108f3f2343f4d6386ba400a61e482792a2544682eee782) |
| Envio indexes it within seconds: Receipt (agentId 2227), Agent #2227 executed 1 / volume $12, Mandate perplKey | ok | — |
| Brain `/traders` → Falcon stats from Envio (executedCount 1, volumeUsd 12) | ok | — |
| Referee `--once` discovers both active mandates via Envio and reads the gateway's `/risk` | ok | — |

## Hosting moved to Render free (2026-10-12, Fly trial ended)
Brain https://leash-brain-api.onrender.com · gateway https://leash-perpl-gateway-testnet.onrender.com (both testnet, paper). ERC-8004
agentURIs re-pointed with `setAgentURI` (gas tank, testnet): Falcon #2227 [https://testnet.monadvision.com/tx/0xc3535311…](https://testnet.monadvision.com/tx/0xc353531153b449cb6abc279011a04c112e1adaa3305d09cdf62d51d402057c5b) ·
Otter #2228 [https://testnet.monadvision.com/tx/0x1d261e30…](https://testnet.monadvision.com/tx/0x1d261e30d496f8eccb33732791a24edc6dfe9485c3024700fb34793421cfe4bf) ·
Owl #2229 [https://testnet.monadvision.com/tx/0x9aa78dab…](https://testnet.monadvision.com/tx/0x9aa78dab185384fdcfc06c3b46cb43f895a7b3c6ff361ada9f77cf264186c8da).
