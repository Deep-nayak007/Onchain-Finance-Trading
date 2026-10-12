# services/api — Brain lane rules (read ARCHITECTURE.md first; it wins over briefs)

## Stack
- macOS, Node 22, pnpm workspace, TypeScript strict, vitest, Hono, node:sqlite. Run: `pnpm dev` / `pnpm test`.
- `@leash/shared`: schemas, canonical JSON, sendTx, checkIntent, fixtures; Rails' abis/ + addresses.ts.
- Map: `src/app.ts` wiring · `server.ts` routes · `loop/engine.ts` tick · `wallet/` Privy · `exec/` gateway+Kuru.

## LLM (overrides every Claude/Anthropic mention in other docs)
- Qwen via OpenAI-compatible API using the `openai` npm package with `baseURL = LLM_BASE_URL`.
- Env: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL_COMPILE (qwen-plus-character), LLM_MODEL_TICK (qwen-flash-character), LLM_MODE=json, LLM_TIMEOUT_MS.
- JSON mode ONLY: `response_format: {type:"json_object"}`, no tool calling.
- Always send a strict system prompt spelling out the exact JSON schema.
- Validate with zod → on failure retry once with the validation error → then the deterministic fallback (`fallbackIntent`, llm/propose.ts).
- The LLM never executes. Only `checkIntent` decides. Invalid output → HOLD (+ REJECTED/INVALID_INTENT if it was a trade).
- Record the model id (or `fallback-rules-v1`) in `ReceiptDetail.model`.

## Chain
- Build and test on Monad TESTNET: CHAIN_ID=10143, MONAD_TESTNET_RPC_URL. Mainnet (143) only when Prem says.
- All txs through `sendTx` (estimate +10%, explicit gas). Confirm by receipt only.
- All hashing through `canonical.ts` (reasonHash / signalHash / policyHash). Face recomputes on the phone.
- History from Envio, never historical RPC state.
- Never invent addresses/ABIs/endpoints. ABIs + addresses.ts are owned by Yadnesh (Brain supplied KURU, Q3).
- Privy: sign with eth_signTransaction, broadcast via our RPC (sendTx). Rule names < 50 chars. Default-deny.
- Known: Referee = 0xFad2FFf6024214711Dc3A6521F40e5871A779a44. Gas tank = GAS_TANK_ADDRESS (env).

## Simulation
- Tenderly is unavailable: skip it when TENDERLY_ACCESS_KEY is empty.
- Alchemy simulation is unsupported on Monad (Q6, probed) → no pre-trade simulation.

## Secrets
- Secrets only in `.env` (gitignored), loaded with dotenv. NEVER cat, print, log or commit them.
- `.env.example` holds variable NAMES only.

## Safety defaults
- LIVE=false, MAX_ORDER_USD=25 until Prem flips it. Re-check isActive(user) right before execution.

## Workflow
- Small, descriptive commits on `brain`; PR to `main` at checkpoints. Frozen interfaces = ARCHITECTURE §7 (announce changes).
- `pnpm -r test` must be green before pushing. Blocked > 45 min → stub, note in docs/LIMITATIONS.md, tell Prem.
