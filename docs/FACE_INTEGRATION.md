# Connect the Face lane

The workspace originally contained no implementation or shared package. On October 12, Brain/Rails' merged main branch was imported so Face can use their actual delivered code. All Face bootstrap data stays inside `apps/mobile/mocks`; no owner implementation files are invented or edited by the adapter. The testnet acceptance status is in [FACE_TESTNET_VALIDATION.md](FACE_TESTNET_VALIDATION.md).

The project uses npm workspaces because npm is installed on this machine. Expo SDK 57 has automatic monorepo support; Metro also watches the repository root. TypeScript is strict. `apps/mobile/CLAUDE.md` is the short reload guide.

## Passkeys

1. The team confirmed `leash-brain-api.fly.dev` as the permanent RP. It is configured now; do not change it after accounts are created. Signing fingerprints and the remaining acceptance steps are in [FACE_PASSKEY_SETUP.md](FACE_PASSKEY_SETUP.md).
2. Copy `apps/mobile/.env.example` to `.env`. Set `EXPO_PUBLIC_PASSKEY_RP_ID`, the actual Apple Team ID and/or Android signing certificate fingerprint. Bundle/package name is provisionally `app.leash.mobile`; settle it before registration.
3. Run `npm run associations --workspace @leash/mobile` from the root. The generator produces actual association files under `artifacts/associations/.well-known/` and rejects missing or malformed signing information.
4. Host both files on the RP domain over HTTPS, with JSON content type and without redirects. The generator does not deploy or publish anything.
5. Rebuild the native app. Choose your paid Apple Developer team for a physical iPhone; the simulator build requires no team.
6. Create and restore an account on a PRF-capable real device. Confirm that restoring the same synced passkey reproduces its address.

Mera is pinned to 0.2.0 with its documented native client and `react-native-passkey` 3.6.1. Browser builds use browser WebAuthn. Native builds use the Mera React Native adapter. The Hermes random-values polyfill loads before Expo Router.

Only credential ID and transports are stored. Each transaction obtains fresh PRF output, derives BIP-44 `m/44'/60'/0'/0/0`, checks the signer against the account, and ends the session in `finally`. Key, seed, PRF, and HD-node private buffers are cleared where the libraries expose them. No key or PRF is saved to SecureStore. JavaScript mnemonic strings cannot be explicitly zeroed; they are never persisted or logged.

## Shared code and live services

Brain supplies `packages/shared/src/canonical.ts`, schemas, fixtures, and `sendTx.ts`. Rails supplies actual ABIs, source-backed deployed addresses, and `queries.graphql`. Metro selects the real shared canonicalizer in testnet/live mode and the isolated mock function in mock mode; TypeScript and tests use the shared implementation. Both agree on the pinned vectors and deployed receipt.

The FACE-owned `integration/team.ts` adapter is implemented by `integration/live.ts`, `indexer.ts` and `receiptProof.ts`. It uses the existing API/OpenAPI and shared exports; no frozen interface is changed. The regular profile uses `.env`; `testnet:ios` / `testnet:web` load optional connection settings and force the deployed API/chain/RPC. `mock:ios` / `mock:web` exclude dotenv context modules so Expo 57 cannot override mock isolation with a live `.env`.

| Binding | Actual implementation required |
|---|---|
| `sendTx` | Shared gas-explicit sender; confirm the configured chain, 143 or 10143, before review/signing |
| `prepareMandate`, `prepareSlack`, `preparePause`, `prepareResume` | Shared MandateRegistry ABI + verified address; estimate gas + 10% |
| `activateAgent`, `resumeAgent` | Brain's actual `/agent/activate` payload; wait for the contract receipt, then restore loop/policy/key enrollment on resume |
| `readReceipts`, `readReceipt`, `readPnl`, `readTraderStats` | Envio query fields copied from shared queries, consumer validation; API personas/stats; unknown returns stay blank |
| `readPolicy`, `readBalanceUsd` | Current mandate and real AUSD token/decimals; no historical RPC calls |
| `prepareDeposit`, `prepareKeyEnrollment`, `prepareManualOrder` | Rails' actual gateway request payloads; Q1 must be resolved for enrollment |
| `readSpotBook`, `quoteSwap` | Depth waits for a supplied interface; `/spot/prepare` supplies unsigned transactions, nonzero minimum output and a locally limited quote review window |

The `queryEnvio` transport uses graphql-request with timeout and runtime validation; the adapter supplies the real shared query document and schema.

All live prepared transactions pass the app's schema check, then a transaction-review sheet, then a fresh passkey prompt. The app verifies the receipt status before subsequent work. Confirmed mandates/slack/resumes retain their backend callback for retry without another signature. Multi-transaction deposits retain confirmed progress so a retry does not repeat an already confirmed transaction. Swap approvals currently require a fresh quote if a later step expires; review confirmed approvals before retrying.

Set `EXPO_PUBLIC_API_URL=https://leash-brain-api.fly.dev`, `EXPO_PUBLIC_CHAIN_ID=10143` and `EXPO_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz`. Gateway/Envio endpoints come from Rails later; push still needs EAS. Status/risk/receipts/slack refresh every 3–4 seconds; trader stats every 5 seconds. Brain confirmed the slack response is `SlackRequest[]`. Compile includes `agentId`, nullable `agentWallet` and nullable `perplKey`; missing wallet/key prevents signing. Gateway percentages are decimal strings, timestamp is unix seconds, and depth levels are `{price,size}` objects normalized for UI use.

The sender preserves destination, calldata, value and explicit gas. Contract preparation checks RPC/chain, deployed registry bytecode, backend deployment agreement and policy fingerprint. Receipt detail is public and does not require a connected wallet. Envio supplies independent anchors once configured. Until then, the first-check receipt uses the transaction hash from Brain's evidence and independently decodes its successful ReceiptLog event; a caller can also provide a `proofTxHash` receipt-link parameter. Other unanchored receipts remain pending. A paper receipt (`execTxHash: null`) never presents a venue trade as executed.

## Native proof and notifications

The 0-value user-signed testnet proof is still an acceptance task: use the delivered shared sender on chain 10143 after the RP domain/device is ready. The testnet transaction path is now accepted; the gas-drip transaction and paper receipt have been independently checked without a user signature. No mainnet proof is claimed.

Push registration is optional and requests permission on a physical phone. It posts only `{account, expoPushToken}`. Missing permissions, simulator use, and a missing EAS project ID leave requests available through polling. Notification routes accept only `{type:'slack', id:uuid}`; the sheet also checks the pending request's account. A real launch-from-terminated notification must still be tested.

## Documentation consulted

- [Mera accounts](https://docs.monad.xyz/guides/mera) and [React Native guide](https://docs.monad.xyz/guides/mera/react-native)
- [Mera source](https://github.com/category-labs/mera) and [authenticator support](https://mera.category.xyz/authenticator-support/)
- [Monad index](https://docs.monad.xyz/llms.txt), [gas](https://docs.monad.xyz/developer-essentials/gas-pricing), [EIP-7702](https://docs.monad.xyz/developer-essentials/eip-7702), [reserve balance](https://docs.monad.xyz/developer-essentials/reserve-balance)
- [Expo monorepos](https://docs.expo.dev/guides/monorepos/), [dev builds](https://docs.expo.dev/develop/development-builds/introduction/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [notifications](https://docs.expo.dev/versions/latest/sdk/notifications/), [fonts](https://docs.expo.dev/versions/latest/sdk/font/), [haptics](https://docs.expo.dev/versions/latest/sdk/haptics/)
- [iOS associated links](https://docs.expo.dev/linking/ios-universal-links/) and [Android links](https://docs.expo.dev/linking/android-app-links/)

When browser extraction failed, the corresponding official Markdown pages, official source, and installed package types were read directly. The shared architecture takes precedence over examples that suggest persisting PRF output.
