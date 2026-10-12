# FACE lane

Read ../../ARCHITECTURE.md and ../../briefs/FACE.md before changes.
Own apps/mobile; do not change Brain/Rails files or frozen §7 interfaces.
Strict TypeScript. Validate external data. Do not invent deployed addresses.
Ink #0F0D16, surface #1B1825, violet #9585FF, rope #ECA43F.
Big Shoulders Display 800, IBM Plex Sans 400/600, IBM Plex Mono 400/600.
Thermal receipts, amber ring, dollars, rules, slack, pull the leash.
Default demo mode is explicit; demo hashes are not onchain verification.
Metro imports shared canonical.ts when present; live mode requires it.
Fixture bootstrap stays inside demo/ until teammates provide shared fixtures.
Every live transaction must use the team's sendTx through integration/team.ts.
No EIP-7702. Monad mainnet 143; testnet proof uses 10143 only.
Mera 0.2.0 + react-native-passkey 3.6.1; native client on mobile, browser on web.
RP ID is permanent; do not choose it for the team.
Prompt per transaction; always end session in finally and clear secret buffers.
Store credentialId and transports only in SecureStore; never store PRF/key.
Check signer matches the signed-in wallet before sending.
Live receipt hash must be anchored to Envio, not the API's own hash.
Respect reduced motion; cancel long-press on release, background, unmount.
No funds are sent while integrations are absent. Live mode never uses demo fallback.
Record incomplete integration acceptance in ../../docs/LIMITATIONS.md.
Use npm workspaces (npm is installed; pnpm is not). Do not touch home-directory Git.
Prefix shell commands with rtk per /Users/deepnayak/.codex/RTK.md.
