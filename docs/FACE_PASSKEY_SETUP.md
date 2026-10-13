# Passkey signing handoff

The team confirmed the permanent RP ID on October 12, 2026:

```env
EXPO_PUBLIC_PASSKEY_RP_ID=leash-brain-api.fly.dev
```

It is set in Deep's local `.env`, both app env examples, and the testnet launch profile. Native configuration has `webcredentials:leash-brain-api.fly.dev` and Android package `app.leash.mobile`. Do not change the RP after accounts are created.

## Send to Prem — Android debug build

```env
ANDROID_CERT_SHA256=FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

This fingerprint comes from the actual Expo-generated `apps/mobile/android/app/debug.keystore`, alias `androiddebugkey`, referenced by `android/app/build.gradle`. The certificate's DER bytes were hashed locally, then independently checked with `openssl x509 -fingerprint -sha256`; private-key material was not exported. The certificate is valid through April 30, 2052.

The Android project was generated with `expo prebuild --platform android --no-install`. Java and the Android SDK are not installed on Deep's Mac, so `./gradlew signingReport` and an Android build have not been run. The fingerprint is for this debug certificate; recompute it if the signing key changes or for a release build.

Generated public file: [assetlinks.json](../artifacts/associations/.well-known/assetlinks.json). It includes both `get_login_creds` and `handle_all_urls`, matching the live API's handoff. Prem should configure `ANDROID_CERT_SHA256` on Fly and confirm this URL returns 200/JSON without redirects:

`https://leash-brain-api.fly.dev/.well-known/assetlinks.json`

## iPhone

Deep confirmed that his Apple account is not enrolled in a paid Developer Program. No Apple Team ID was configured, and no Apple association file was generated. The local Personal Team signing certificate is not being used to claim paid-team passkey support.

A teammate with a paid developer team must provide the actual Team ID and sign the iPhone build (or grant the development/signing access needed for Deep to build it). Prem must publish the matching `webcredentials.apps` entry, `<TEAM_ID>.app.leash.mobile`, at:

`https://leash-brain-api.fly.dev/.well-known/apple-app-site-association`

Then rebuild the app with the associated-domains capability. iPhone sign-up stays unavailable until a team is configured. The public paper receipt and sample mode remain usable. Reference: [Apple provisioning capabilities](https://developer.apple.com/help/account/reference/supported-capabilities-ios/).

## Current acceptance

- Both association endpoints returned **404** when checked; no passkey ceremony is claimed.
- TypeScript and **29 mobile tests** pass, including rejecting localhost/lookalike browser origins for the fixed RP and withholding iPhone sign-up without a signing team.
- Both native prebuilds completed; the generated iOS entitlements contain `webcredentials:leash-brain-api.fly.dev`. The public browser receipt flow still passes with the confirmed domain configured. These are setup checks, not a rebuilt/signed-device passkey ceremony.
- Browser previews on localhost can show receipts; passkey create/recovery needs a native app with its association or a web build served on the RP domain (or a valid subdomain).
- Gateway and Envio endpoints still come from Rails. The API remains testnet paper mode.

Once the association files are live, rebuild and test create → restore same account → sign reviewed testnet transaction on a PRF-capable native device. No native Android build, real Face ID/fingerprint signing, or real venue trade has been validated in this setup step.
