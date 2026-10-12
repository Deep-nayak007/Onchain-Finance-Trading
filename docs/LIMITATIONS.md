# Current limitations

The Face app is implemented as a working demo and a prepared live consumer. It is not yet a proven live trader. No blockchain receipt, registered identity, Face ID ceremony, or real trade has been claimed for sample data.

- The source workspace had no shared package, contracts, indexer, API, or gateway. The supplied architecture was found in `Downloads/leash/`. Face-owned bootstrap schemas and samples are in `apps/mobile`; they do not replace owner files. The live adapter is intentionally unbound.
- A permanent passkey domain, paid Apple team/signing details, and an actual PRF-capable phone are missing. Real-device passkey acceptance and the 0-value testnet proof are pending. The app never selects a domain for the team.
- Mainnet deposit, enrollment, rules, slack, pause/resume, manual trade, and spot swap require the actual ABI, addresses, shared sender, and service payloads. Some request bodies and all Envio query fields were not frozen in the supplied files; they are adapter-owned until delivered. No additional endpoint or contract address was invented.
- The sample rule compiler is deterministic and produces a visible sample warning. It is not an AI compiler. Persona performance and order-book data are samples. Sample hash matches never show an onchain ✓.
- Demo data is held in memory and resets when the app reloads. Demo orders and swaps illustrate flows rather than constitute an exchange or financial simulator.
- Native Desktop builds encounter Apple File Provider/Finder metadata errors during framework signing. `ios:cached` builds an identical dependency/source copy under `Library/Caches` without extended attributes. The generated iOS project is not source-controlled.
- Runtime delivery of push requests from a terminated app and real device permission/failure states need testing. Slack polling works independently of push.
- The two-minute preview and web screenshot exports use sample data. They are review assets, not evidence for live bounty acceptance. Submission form fields require the signed-in team workspace.
- `npm audit fix --ignore-scripts` leaves 29 inherited dependency reports (18 high, 11 moderate) in the current Expo/React Native dependency graph. npm suggests incompatible major changes/downgrades for the remaining reports, including Expo 44; those were not applied. Review upstream patches before a public production release. This is recorded as an unresolved check, not a clean security audit.

The remaining dependencies were requested from Deep while work continued. No messages were sent to teammates and no app was deployed, published, or submitted.
