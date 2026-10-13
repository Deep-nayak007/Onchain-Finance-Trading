# Passkey signing handoff

Deep approved migrating the native RP on October 12, 2026 and confirmed no existing LEASH passkeys:

```env
EXPO_PUBLIC_PASSKEY_RP_ID=leash-brain-api.onrender.com
```

It is set in Deep's local `.env`, both app env examples, and the testnet launch profile. Native configuration has `webcredentials:leash-brain-api.onrender.com` and Android package `app.leash.mobile`. This supersedes the Fly host, whose trial ended. Do not change the RP after accounts are created. The hosted browser app uses its own RP (`leash-app.onrender.com`); native accounts use the approved Brain host.

## Send to Prem — Android debug build

```env
ANDROID_CERT_SHA256=FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

This fingerprint comes from the actual Expo-generated `apps/mobile/android/app/debug.keystore`, alias `androiddebugkey`, referenced by `android/app/build.gradle`. The certificate's DER bytes were hashed locally, then independently checked with `openssl x509 -fingerprint -sha256`; private-key material was not exported. The certificate is valid through April 30, 2052.

The Android project was generated with `expo prebuild --platform android --no-install`. Java and the Android SDK are not installed on Deep's Mac, so `./gradlew signingReport` and an Android build have not been run. The fingerprint is for this debug certificate; recompute it if the signing key changes or for a release build.

Generated public file: [assetlinks.json](../artifacts/associations/.well-known/assetlinks.json). It includes both `get_login_creds` and `handle_all_urls`, matching the live API's handoff. Prem should configure `ANDROID_CERT_SHA256` on Render and confirm this URL returns 200/JSON without redirects:

`https://leash-brain-api.onrender.com/.well-known/assetlinks.json`

## iPhone

Deep confirmed that his Apple account is not enrolled in a paid Developer Program. No Apple Team ID was configured, and no Apple association file was generated. The local Personal Team signing certificate is not being used to claim paid-team passkey support.

A teammate with a paid developer team must provide the actual Team ID and sign the iPhone build (or grant the development/signing access needed for Deep to build it). Prem must publish the matching `webcredentials.apps` entry, `<TEAM_ID>.app.leash.mobile`, at:

`https://leash-brain-api.onrender.com/.well-known/apple-app-site-association`

Then rebuild the app with the associated-domains capability. iPhone sign-up stays unavailable until a team is configured. The public paper receipt and sample mode remain usable. Reference: [Apple provisioning capabilities](https://developer.apple.com/help/account/reference/supported-capabilities-ios/).

## Current acceptance

- Android's Render association endpoint returned **404**. The iOS association returns **200**, but lists `WYHX7XQG8Y`, Deep's Personal Team. Publishing that ID does not establish paid-team iPhone capability; it stays unset in Face's local `.env` and iPhone sign-up remains unavailable.
- TypeScript and mobile tests pass, including rejecting localhost/lookalike browser origins for the fixed RP and withholding iPhone sign-up without a signing team.
- Both native prebuilds completed; the generated iOS entitlements contain `webcredentials:leash-brain-api.onrender.com`. The public browser receipt flow handles missing Brain reasoning without claiming verification. These are setup checks, not a rebuilt/signed-device passkey ceremony.
- Browser previews on localhost can show receipts; passkey create/recovery needs a native app with its association or a web build served on the RP domain (or a valid subdomain).
- Gateway and Envio now come from the merged shared service configuration. The API remains testnet paper mode.

Once the association files are live, rebuild and test create → restore same account → sign reviewed testnet transaction on a PRF-capable native device. No native Android build, real Face ID/fingerprint signing, or real venue trade has been validated in this setup step.
