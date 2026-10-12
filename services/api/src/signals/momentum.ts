// Price momentum from observed marks (no extra API calls): change vs the oldest sample in a rolling window.
// Used when Nansen has no Monad data, so the trader still has a real, verifiable signal.

export const MOMENTUM_WINDOW_MS = 30 * 60_000;
export const MOMENTUM_MIN_AGE_MS = 3 * 60_000;

export class MarkHistory {
  private readonly samples = new Map<string, { t: number; mark: number }[]>();

  record(market: string, mark: number, now: number) {
    if (!(mark > 0)) return;
    const s = this.samples.get(market) ?? [];
    s.push({ t: now, mark });
    while (s.length && now - s[0]!.t > MOMENTUM_WINDOW_MS) s.shift();
    this.samples.set(market, s);
  }

  /** % change vs the oldest sample ≥ MIN_AGE old; null until there's enough history. */
  change(market: string, now: number): { pct: number; minutes: number } | null {
    const s = this.samples.get(market);
    const first = s?.[0];
    const last = s?.at(-1);
    if (!first || !last || now - first.t < MOMENTUM_MIN_AGE_MS) return null;
    return { pct: Math.round(((last.mark - first.mark) / first.mark) * 10_000) / 100, minutes: Math.round((now - first.t) / 60_000) };
  }
}
