// Unit helpers (ARCHITECTURE §6): USD decimal strings ↔ usd6 ints, prices ↔ 1e18, leverage ↔ X10.

/** "12.5" → 12_500_000n. Rejects more than 6 decimals. */
export function toUsd6(usd: string): bigint {
  const m = /^(-)?(\d+)(?:\.(\d{1,6}))?$/.exec(usd.trim());
  if (!m) throw new Error(`invalid USD amount "${usd}"`);
  const [, neg, int, frac = ""] = m;
  const v = BigInt(int!) * 1_000_000n + BigInt(frac.padEnd(6, "0"));
  return neg ? -v : v;
}

/** 12_500_000n → "12.5" */
export function fromUsd6(v: bigint): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const int = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/** Number → USD string with at most 6 decimals (rounded down toward zero). */
export function usdFromNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`invalid USD number ${n}`);
  return fromUsd6(BigInt(Math.trunc(n * 1_000_000)));
}

/** "2.4315" → 2431500000000000000n. Extra decimals beyond 18 are truncated. */
export function toPrice1e18(price: string): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(price.trim());
  if (!m) throw new Error(`invalid price "${price}"`);
  const [, int, frac = ""] = m;
  return BigInt(int!) * 10n ** 18n + BigInt(frac.slice(0, 18).padEnd(18, "0"));
}

/** 3 → 30, 2.5 → 25 */
export const leverageToX10 = (lev: number): number => Math.round(lev * 10);
export const leverageFromX10 = (x10: number): number => x10 / 10;

/** Side → int8 used onchain. */
export const sideToInt8 = (side: "LONG" | "SHORT" | "BUY" | "SELL"): 1 | -1 => (side === "LONG" || side === "BUY" ? 1 : -1);
