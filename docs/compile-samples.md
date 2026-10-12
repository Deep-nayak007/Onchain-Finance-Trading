# Rules compiler: 5 sample prompts

Real runs of the `POST /mandate/compile` logic against Qwen (`qwen-plus-character`, JSON mode, prompt compile v2) on 2026-10-12.
The model copies the person's numbers; the server clamps to the demo maxima (leverage ≤ 5x, trade ≤ $100, exposure ≤ $100, weekly loss ≤ 20%) and warns for each clamp.

## falcon: "Keep it small. Never more than $20 a trade and 2x leverage. Stop if I lose 5% in a week."

Model: `qwen-plus-character` · policyHash `0xe9befa161b2da1b67641cf89b8c1ca1b639cb58b22f2230d79809bd26b59e919`

**Leash Card**
- Falcon may trade MON-PERP only.
- Each trade is at most $20 with up to 2x leverage; never more than $50 open at once.
- If you're down 5% this week, trading stops until next week.
- At most 4 trades an hour, with at least 5 minutes between trades.
- Falcon only opens a trade when smart money (Nansen) agrees.
- It can never withdraw your money. You can pull the leash any time.

**Warnings:** none

<details><summary>Policy JSON</summary>

```json
{
  "version": 1,
  "markets": [
    "MON-PERP"
  ],
  "venues": [
    "PERPL"
  ],
  "maxLeverage": 2,
  "maxNotionalUsd": "20",
  "maxTotalExposureUsd": "50",
  "maxWeeklyLossPct": 5,
  "maxTradesPerHour": 4,
  "cooldownSec": 300,
  "requireSmartMoneyAgreement": true,
  "minConfidence": 0.6,
  "sleeveUsd": "0"
}
```
</details>

## falcon: "I want to go big: 10x leverage, $500 per trade, trade MON perps all day."

Model: `qwen-plus-character` · policyHash `0xb1284fbd4b89920304fef9bb61f8340fe3f9b565d4b972da496d63dba0cbca14`

**Leash Card**
- Falcon may trade MON-PERP only.
- Each trade is at most $100 with up to 5x leverage; never more than $100 open at once.
- If you're down 10% this week, trading stops until next week.
- At most 4 trades an hour, with at least 5 minutes between trades.
- Falcon only opens a trade when smart money (Nansen) agrees.
- It can never withdraw your money. You can pull the leash any time.

**Warnings:** Leverage capped at 5x (asked 10x). Trade size capped at $100 (asked $500). Total exposure capped at $100 (asked $500).

<details><summary>Policy JSON</summary>

```json
{
  "version": 1,
  "markets": [
    "MON-PERP"
  ],
  "venues": [
    "PERPL"
  ],
  "maxLeverage": 5,
  "maxNotionalUsd": "100",
  "maxTotalExposureUsd": "100",
  "maxWeeklyLossPct": 10,
  "maxTradesPerHour": 4,
  "cooldownSec": 300,
  "requireSmartMoneyAgreement": true,
  "minConfidence": 0.6,
  "sleeveUsd": "0"
}
```
</details>

## otter: "Only trade when the price looks stretched. Max 3 trades a day, 1x, $10 each, wait at least an hour between trades."

Model: `qwen-plus-character` · policyHash `0x988e810557b68e9ab1fd41ee20a527d6b7e47042d6661f5b3bb13925326cd46d`

**Leash Card**
- Otter may trade MON-PERP only.
- Each trade is at most $10 with up to 1x leverage; never more than $30 open at once.
- If you're down 10% this week, trading stops until next week.
- At most 1 trade an hour, with at least 60 minutes between trades.
- Otter only opens a trade when smart money (Nansen) agrees.
- It can never withdraw your money. You can pull the leash any time.

**Warnings:** none

<details><summary>Policy JSON</summary>

```json
{
  "version": 1,
  "markets": [
    "MON-PERP"
  ],
  "venues": [
    "PERPL"
  ],
  "maxLeverage": 1,
  "maxNotionalUsd": "10",
  "maxTotalExposureUsd": "30",
  "maxWeeklyLossPct": 10,
  "maxTradesPerHour": 1,
  "cooldownSec": 3600,
  "requireSmartMoneyAgreement": true,
  "minConfidence": 0.6,
  "sleeveUsd": "0"
}
```
</details>

## owl: "Harvest funding on MON perps and hedge with spot on Kuru. $30 per trade max, 2x, keep $25 for spot hedging."

Model: `qwen-plus-character` · policyHash `0xd9e4978c8d1d4f85edfbb6901a3665e979d38b710f109bf82e9f2546a82b4e44`

**Leash Card**
- Owl may trade MON-PERP and MON/AUSD only (up to $25 on Kuru spot to hedge).
- Each trade is at most $30 with up to 2x leverage; never more than $50 open at once.
- If you're down 10% this week, trading stops until next week.
- At most 4 trades an hour, with at least 5 minutes between trades.
- Owl only opens a trade when smart money (Nansen) agrees.
- It can never withdraw your money. You can pull the leash any time.

**Warnings:** none

<details><summary>Policy JSON</summary>

```json
{
  "version": 1,
  "markets": [
    "MON-PERP",
    "MON/AUSD"
  ],
  "venues": [
    "KURU",
    "PERPL"
  ],
  "maxLeverage": 2,
  "maxNotionalUsd": "30",
  "maxTotalExposureUsd": "50",
  "maxWeeklyLossPct": 10,
  "maxTradesPerHour": 4,
  "cooldownSec": 300,
  "requireSmartMoneyAgreement": true,
  "minConfidence": 0.6,
  "sleeveUsd": "25"
}
```
</details>

## falcon: "follow the smart money but be careful, I'm new to this"

Model: `qwen-plus-character` · policyHash `0x2745bec3a9e3b025495af3528b553c0ce3e0ab431a4b113fe8d5244011e9c984`

**Leash Card**
- Falcon may trade MON-PERP only.
- Each trade is at most $25 with up to 2x leverage; never more than $50 open at once.
- If you're down 10% this week, trading stops until next week.
- At most 4 trades an hour, with at least 5 minutes between trades.
- Falcon only opens a trade when smart money (Nansen) agrees.
- It can never withdraw your money. You can pull the leash any time.

**Warnings:** none

<details><summary>Policy JSON</summary>

```json
{
  "version": 1,
  "markets": [
    "MON-PERP"
  ],
  "venues": [
    "PERPL"
  ],
  "maxLeverage": 2,
  "maxNotionalUsd": "25",
  "maxTotalExposureUsd": "50",
  "maxWeeklyLossPct": 10,
  "maxTradesPerHour": 4,
  "cooldownSec": 300,
  "requireSmartMoneyAgreement": true,
  "minConfidence": 0.6,
  "sleeveUsd": "0"
}
```
</details>
