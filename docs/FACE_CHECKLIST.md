# Face checkpoint checklist

Dates use America/Phoenix: CP0 Sun Oct 11 at 23:00; CP1 Mon Oct 12 at 12:00; CP2 Mon Oct 12 at 20:00; CP3 Tue Oct 13 at 08:00. A screen being complete with samples does not satisfy live acceptance.

| Brief row | Checkpoint | Implementation | Remaining acceptance |
|---|---|---|---|
| Permanent domain + Face ID passkey | CP0 | Mera native/web create, restore, session lifecycle; association generator | Domain, signing team, real PRF-capable phone; actual address + 10143 proof |
| Onboarding: gas + devices | CP1 | Welcome/setup, drip request, gas balance check, optional push registration | Live gas arrives under 30s; physical device token |
| Home | CP1 | Dollar balance, animated ring, status, P&L, rule summary, hold button | Shared balance/current mandate + live status/risk |
| Rules writer | CP1 | Sample compiler + typed live compiler, fingerprint comparison, editable card | Brain compiler; real shared policy fixture |
| Visual system + component gallery | CP1 | Tokens, bundled fonts, six signature components, `/dev/components` | Device review/accessibility review |
| Perpl deposit + trade-only key | CP2 | Deposit/permission screens, separate signing prompts, confirmed progress | Actual collateral, enrollment Q1, gateway payloads |
| Sign Leash Card + activate | CP2 | Confirm mandate receipt before adapter activation | ABI/address + shared sender + backend payload |
| Receipts + local hash check | CP2 | Feed/filter, detail, separate indexed anchor, reason + signal checks, latency, tamper demo | Shared canonical + indexed live receipt; ✓ on real phone |
| Manual Perpl trade | CP2 | Long/short, leverage/size, $25 cap, prepared transaction path | One real user-signed trade |
| Slack sheet | CP3 | Account/expiry checks, why chips, approve/deny, sample executed receipt | Real grant + approval callback + push |
| Risk / Perpl analytics | CP3 | Positions, liquidation, exposure, loss limit, funding, indexed curve; 4s polling | Gateway and actual Envio queries |
| Traders / identity | CP3 | Falcon/Otter/Owl, modes, stats, persona-to-rules selection | Real fill-derived stats and ERC-8004 links |
| Spot / Kuru | CP3 | Direction, fresh quote, expiry, depth, explicit confirmation | Actual helper, approved tokens/market, one real swap |
| Kill + resume | CP3 | 1.2s cancellable hold, heavy haptic, pause receipt, resume; real contract path | Onchain pause + backend cleanup; actual user-only resume |
| Loading / empty / error states | CP3 | All query screens and mutation errors | Live service outage checks |
| 2-minute video + 6 screenshots | Ship | Capture tools + sample-data preview artifacts | Replace with real Face ID/trade footage for final submission |
| Q9 cutoff + form | Ship | Official UTC deadline checked | Authenticated submission form fields |
| Aurora funding | Stretch | Deferred per brief | Only after required live work |

The mainnet proof checklist needs a funded test account and authorization for the first real-funds transaction. No real funds have moved during this build.
