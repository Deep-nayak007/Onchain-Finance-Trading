# Connect the Face lane

The workspace originally contained no implementation or shared package. The supplied architecture and three briefs are copied verbatim to the repository. All bootstrap data and code stay inside `apps/mobile`; no Brain or Rails implementation files were invented.

The project uses npm workspaces because npm is installed on this machine. Expo SDK 57 has automatic monorepo support; Metro also watches the repository root. TypeScript is strict. `apps/mobile/CLAUDE.md` is the short reload guide.

## Passkeys

1. Choose the permanent RP hostname with the team. Do not change it after accounts are created.
2. Copy `apps/mobile/.env.example` to `.env`. Set `EXPO_PUBLIC_PASSKEY_RP_ID`, the actual Apple Team ID and/or Android signing certificate fingerprint. Bundle/package name is provisionally `app.leash.mobile`; settle it before registration.
3. Run `npm run associations --workspace @leash/mobile` from the root. The generator produces actual association files under `artifacts/associations/.well-known/` and rejects missing or malformed signing information.
4. Host both files on the RP domain over HTTPS, with JSON content type and without redirects. The generator does not deploy or publish anything.
5. Rebuild the native app. Choose your paid Apple Developer team for a physical iPhone; the simulator build requires no team.
6. Create and restore an account on a PRF-capable real device. Confirm that restoring the same synced passkey reproduces its address.

Mera is pinned to 0.2.0 with its documented native client and `react-native-passkey` 3.6.1. Browser builds use browser WebAuthn. Native builds use the Mera React Native adapter. The Hermes random-values polyfill loads before Expo Router.

Only credential ID and transports are stored. Each transaction obtains fresh PRF output, derives BIP-44 `m/44'/60'/0'/0/0`, checks the signer against the account, and ends the session in `finally`. Key, seed, PRF, and HD-node private buffers are cleared where the libraries expose them. No key or PRF is saved to SecureStore. JavaScript mnemonic strings cannot be explicitly zeroed; they are never persisted or logged.

## Shared code and live services

Brain supplies `packages/shared/canonical.ts`, schemas, fixtures, and `sendTx.ts`. Rails supplies actual ABIs, source-backed deployed addresses, and `queries.graphql`. Mock mode always uses the local mock canonicalizer so incoming teammate code cannot break isolated testing. Live mode selects the team's canonical function and refuses a bundle if it is missing. The mock canonicalizer is explicitly a bootstrap and must match the team's vectors before live use.

Fill the FACE-owned `apps/mobile/integration/team.ts` adapter with imports from the actual delivered files. Its interface maps existing interfaces into app view models; it does not modify architecture §7 or require a new backend endpoint. Use the actual exports rather than renaming or recreating the owners' package.

| Binding | Actual implementation required |
|---|---|
| `sendTx` | Delegate every send to the shared gas-explicit sender; confirm chain 143 |
| `prepareMandate`, `prepareSlack`, `preparePause`, `prepareResume` | Shared MandateRegistry ABI + verified address; estimate gas + 10% |
| `activateAgent`, `resumeAgent` | Brain's actual `/agent/activate` payload; wait for the contract receipt, then restore loop/policy/key enrollment on resume |
| `readReceipts`, `readReceipt`, `readPnl`, `readTraderStats` | Shared Envio queries and actual entity fields, with consumer validation |
| `readPolicy`, `readBalanceUsd` | Current mandate and real AUSD token/decimals; no historical RPC calls |
| `prepareDeposit`, `prepareKeyEnrollment`, `prepareManualOrder` | Rails' actual gateway request payloads; Q1 must be resolved for enrollment |
| `readSpotBook`, `quoteSwap` | Brain's actual Kuru helper; quote expiry, minimum output, token approvals |

The `queryEnvio` transport uses graphql-request with timeout and runtime validation; the adapter supplies the real shared query document and schema.

All live prepared transactions pass the app's schema check, then a transaction-review sheet, then a fresh passkey prompt. The app verifies the receipt status before subsequent work. Confirmed mandates/slack/resumes retain their backend callback for retry without another signature. Multi-transaction deposits retain confirmed progress so a retry does not repeat an already confirmed transaction. Swap approvals currently require a fresh quote if a later step expires; review confirmed approvals before retrying.

Set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GATEWAY_URL`, `EXPO_PUBLIC_ENVIO_URL`, and `EXPO_PUBLIC_EAS_PROJECT_ID`. The REST clients implement only the paths named in §7. Status/risk/receipts/slack refresh every 3–4 seconds; trader stats refresh every 5 seconds. No endpoint falls back to demo data in live mode. The exact `/slack/pending` response container must be confirmed with Brain; the consumer currently accepts `SlackRequest[]`.

After connecting the adapter and fixtures, switch `EXPO_PUBLIC_USE_MOCKS=false`, rebuild, and run the live checklist. The sender adapter must preserve prepared destination, calldata, native value, and explicit gas. Confirm deployed bytecode and policy fingerprints before signing. Never accept an API-provided hash as the chain anchor: the detail check separately fetches the indexed receipt for the connected account.

## Native proof and notifications

The 0-value testnet proof is still an acceptance task: use the delivered shared sender on chain 10143, not the mainnet-only `TxRequest` screen path. Record the real device address and transaction hash. No testnet or mainnet proof has been fabricated.

Push registration is optional and requests permission on a physical phone. It posts only `{account, expoPushToken}`. Missing permissions, simulator use, and a missing EAS project ID leave requests available through polling. Notification routes accept only `{type:'slack', id:uuid}`; the sheet also checks the pending request's account. A real launch-from-terminated notification must still be tested.

## Documentation consulted

- [Mera accounts](https://docs.monad.xyz/guides/mera) and [React Native guide](https://docs.monad.xyz/guides/mera/react-native)
- [Mera source](https://github.com/category-labs/mera) and [authenticator support](https://mera.category.xyz/authenticator-support/)
- [Monad index](https://docs.monad.xyz/llms.txt), [gas](https://docs.monad.xyz/developer-essentials/gas-pricing), [EIP-7702](https://docs.monad.xyz/developer-essentials/eip-7702), [reserve balance](https://docs.monad.xyz/developer-essentials/reserve-balance)
- [Expo monorepos](https://docs.expo.dev/guides/monorepos/), [dev builds](https://docs.expo.dev/develop/development-builds/introduction/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [notifications](https://docs.expo.dev/versions/latest/sdk/notifications/), [fonts](https://docs.expo.dev/versions/latest/sdk/font/), [haptics](https://docs.expo.dev/versions/latest/sdk/haptics/)
- [iOS associated links](https://docs.expo.dev/linking/ios-universal-links/) and [Android links](https://docs.expo.dev/linking/android-app-links/)

When browser extraction failed, the corresponding official Markdown pages, official source, and installed package types were read directly. The shared architecture takes precedence over examples that suggest persisting PRF output.
