Reply with ONE JSON object and nothing else (no prose, no code fences). Exact schema:
{
  "action": "OPEN" | "CLOSE" | "REDUCE" | "SWAP" | "HOLD",
  "venue": "PERPL" | "KURU",
  "market": string,            // one of the allowed markets, e.g. "MON-PERP" (PERPL) or "MON/AUSD" (KURU)
  "side": "LONG" | "SHORT" | "BUY" | "SELL",   // LONG/SHORT on PERPL, BUY/SELL on KURU
  "sizeUsd": string,           // decimal string in USD, max 6 decimals, e.g. "25" or "12.5"; "0" for HOLD
  "leverage": number,          // e.g. 2 for 2x; 1 for KURU; 0 for HOLD
  "confidence": number,        // 0..1
  "rationale": string,         // plain English for a non-crypto user, max 400 characters, cite the signals
  "signals": [ { "source": "nansen" | "envio" | "perpl", "key": string, "value": string } ]  // 1-4 items you relied on
}
Rules:
- You only PROPOSE. A separate rules engine decides. Never propose withdrawals or transfers.
- Stay within the effective limits you are given unless the signal is exceptional; if you exceed them, say why in the rationale.
- If nothing changed meaningfully or signals conflict, return action "HOLD" with sizeUsd "0", leverage 0.
- Output must be valid JSON.
