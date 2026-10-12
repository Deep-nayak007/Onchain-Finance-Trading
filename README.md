# LEASH · FACE

Give your AI trader slack. Never your keys.

The Face lane is an Expo React Native app for iOS, Android, and a browser preview. It includes every screen in the supplied brief, the dark visual system, on-device receipt fingerprints, and an interactive threat-model demo. **The default build uses clearly labelled sample data.** Real Face ID and mainnet acceptance require the team's account domain, shared package, deployments, and services.

For local testing before Brain/Rails arrive, run from the repository root:

```sh
npm run mock:ios
```

This opens the installed development build through **localhost**, forces mock mode, and bypasses real passkey onboarding. Edit [mocks/data.json](apps/mobile/mocks/data.json) for sample values. Tap **DEMO** to reset the sample, renew slack, or test an empty portfolio. Keep the terminal running. `npm run mock:web` runs the same samples in a browser. The old `100.110…` server address is blocked by iOS App Transport Security; use the localhost entry. [Mock testing guide](apps/mobile/mocks/README.md).

Start the regular development server from the repository root:

```sh
npm install
npm run web
```

The browser preview runs at http://localhost:8081. Start the development client with `npm start`. Expo Go cannot run the native Mera passkey module.

On this Mac, build in a local cache to avoid synced Desktop metadata breaking Xcode signing:

```sh
npm run ios:cached --workspace @leash/mobile -- --device "iPhone 17 Pro"
```

Then run `npm start` from this source workspace and open its server in the LEASH development client. The cache is `~/Library/Caches/leash-native-build`; code remains in `apps/mobile`. If the project lives outside a synced directory, `npm run ios` builds directly.

Checks and capture tools:

```sh
npm run check
npm test
npm run smoke --workspace @leash/mobile
npm run capture --workspace @leash/mobile
npm run export:web --workspace @leash/mobile
```

`smoke` and `capture` need the preview server running. The sample-data flow includes a short-hold cancellation, pause/resume, a denied trade → slack approval → executed receipt, receipt tampering, rule-card editing, trader selection, quotes, and a manual trade. `/dev/components` shows the component library; `/break-leash` explains seven attacks.

Use [ARCHITECTURE.md](ARCHITECTURE.md) as the source of truth. The app's [integration guide](docs/FACE_INTEGRATION.md), [checkpoint checklist](docs/FACE_CHECKLIST.md), and [limitations](docs/LIMITATIONS.md) identify the remaining team dependencies. Demo artifacts are in `artifacts/`.

The official portal displays **October 14, 2026, 03:59 UTC**, which is **Tuesday, October 13 at 8:59 PM in Phoenix**. Target delivery at least two hours earlier, **6:59 PM Phoenix**. See [submission notes](docs/SUBMISSION.md) and the [official calendar](https://hackathon.monad.xyz/calendar).

The source handoff is packaged as `artifacts/leash-face-kit.zip`; a standalone static browser export is `artifacts/leash-web-preview.zip`. Neither is published.
