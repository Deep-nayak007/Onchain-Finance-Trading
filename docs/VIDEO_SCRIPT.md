# Two-minute demo preview

This is a narrated walkthrough of the implemented interface with sample data. The video carries a continuous DEMO / SAMPLE DATA / NO FUNDS MOVED label. It does not show a real Face ID ceremony, real trader identity, or live order.

| Time | Screen | Story | Replace for final proof |
|---|---|---|---|
| 0:00–0:12 | Break the leash | Leaked trading key cannot withdraw; five safeguards | Exchange permission enforcement evidence |
| 0:12–0:28 | Welcome → Home | Your passkey derives your wallet; no seed phrase | Real iPhone passkey create/restore |
| 0:28–0:45 | Rules → Leash Card | Precise limits, reviewed by the user | Brain's real compiler + signed mandate |
| 0:45–1:05 | Receipts → detail → tamper | Local fingerprint check fails on changed content | Independent Envio anchor with an onchain ✓ |
| 1:05–1:22 | Slack → executed sample receipt | Narrow request, expiry, user approval | Real Face ID grant + confirmed execution |
| 1:22–1:40 | Hold → pause → resume → risk | Short hold cancels; user controls pause/resume | Contract pause + Brain/Privy/gateway shutdown |
| 1:40–2:00 | Traders → five knots | Shadow first, no cherry-picking, why Monad | Actual ERC-8004 identities and indexed stats |

Regenerate the review preview with the browser server running:

```sh
cd apps/mobile
node scripts/video-preview.mjs
```

It records the actual app interactions, uses macOS Samantha for narration, and renders a 1920×1080 H.264/AAC MP4 with FFmpeg. Raw captures and intermediate audio stay in ignored `artifacts/raw/`. Six browser screenshots have their own provenance note; native simulator captures are stored separately.
