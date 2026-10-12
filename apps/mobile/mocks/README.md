# Mock data for local testing

Edit **data.json** to change the wallet balance, risk, positions, traders, rules, receipt signals, slack request, price history, or order book. This is the one data source for the Face app's mock mode. No Brain/Rails service, deployed contract, or passkey account is required.

From the repository root:

```sh
npm run mock:ios
```

For a browser instead: `npm run mock:web`. Both commands force mock mode and use `http://localhost:8081` to avoid iOS rejecting the previous `100.110…` HTTP address. Keep the command running while testing. The native development build must already be installed; use `ios:cached` for the first install on another Mac.

Tap **DEMO** in any screen's header to open controls:

- **Reset all mock data** restores the original balance, positions, rules, and receipts, and gives the slack request a fresh ten-minute expiry.
- **Create a fresh slack request** lets you repeat the approval flow after a request expires or is answered.
- **Show an empty portfolio** tests empty receipts, positions, balances, and the P&L curve. Reset to restore the normal scenario.

On Welcome, **Continue with demo account** and **Restore demo account** run the onboarding screens without opening a real Face ID ceremony. Mock deposits, rules, trades, swaps, slack approvals, and pause/resume update only local memory. Reloading or resetting restores the sample state. Receipt hashes are really recomputed, but their labels identify them as samples.

`fixtures.ts` validates data.json and adds fresh dates and local hashes. `store.ts` contains mutable test state and reset helpers. `canonical.ts` is used only in mock mode. When teammates' code arrives, set `EXPO_PUBLIC_USE_MOCKS=false`, connect `integration/team.ts`, and restart Metro; live hashing uses the actual shared canonical function.

References: [Expo localhost server option](https://docs.expo.dev/more/expo-cli/#server-url) and [Apple local networking / ATS](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking). The app keeps global arbitrary HTTP loads disabled.
