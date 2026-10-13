// Referee breach rules (the 4th knot). Pure and dependency-free so the CRE workflow bundles the same code.
// Breach if: weekly loss ≥ the mandate's limit, any position within 5% of liquidation, or
// 3 consecutive stale/failed reads (fail closed).

export type RefereeConfig = {
  staleFailsMax: number;
  minLiqDistancePct: number;
  maxCacheLagBlocks: number;
};

// Monad blocks are ~0.4s: 50 blocks ≈ 20s of gateway cache lag (20 flapped in practice under the RPC throttle).
export const DEFAULT_REFEREE: RefereeConfig = { staleFailsMax: 3, minLiqDistancePct: 5, maxCacheLagBlocks: 50 };

export type RefereeInput = {
  /** null = no mandate (nothing to watch). */
  mandate: { maxWeeklyLossBps: number; paused: boolean } | null;
  /** Gateway /risk; null when the read failed. */
  risk: { weeklyPnlPct: string; positions: { market: string; liqDistancePct: string }[] } | null;
  /** Gateway /health; null when the read failed. */
  health: { ok: boolean; cacheLagBlocks: number } | null;
  /** Consecutive stale/failed checks before this one. */
  staleCount: number;
};

export type BreachRule = "weekly_loss" | "liq_distance" | "stale";

export type Verdict =
  | { action: "skip"; staleCount: number; detail: string }
  | { action: "ok"; staleCount: number; detail: string }
  | { action: "pause"; rule: BreachRule; reason: `referee:${BreachRule}`; staleCount: number; detail: string };

export function evaluate(i: RefereeInput, cfg: RefereeConfig = DEFAULT_REFEREE): Verdict {
  if (!i.mandate) return { action: "skip", staleCount: 0, detail: "no mandate" };
  if (i.mandate.paused) return { action: "skip", staleCount: 0, detail: "already paused" };

  const stale = !i.risk || !i.health || !i.health.ok || i.health.cacheLagBlocks > cfg.maxCacheLagBlocks;
  if (stale) {
    const staleCount = i.staleCount + 1;
    const why = !i.health ? "health read failed" : !i.health.ok ? "gateway not ok" : !i.risk ? "risk read failed" : `cache lag ${i.health.cacheLagBlocks} blocks`;
    if (staleCount >= cfg.staleFailsMax) {
      return { action: "pause", rule: "stale", reason: "referee:stale", staleCount, detail: `${staleCount} consecutive stale checks (${why})` };
    }
    return { action: "ok", staleCount, detail: `stale ${staleCount}/${cfg.staleFailsMax}: ${why}` };
  }

  const risk = i.risk!;
  const limitPct = i.mandate.maxWeeklyLossBps / 100;
  const pnl = Number(risk.weeklyPnlPct);
  if (Number.isFinite(pnl) && pnl <= -limitPct) {
    return { action: "pause", rule: "weekly_loss", reason: "referee:weekly_loss", staleCount: 0, detail: `weekly PnL ${pnl}% ≤ −${limitPct}%` };
  }
  const near = risk.positions.find((p) => Number(p.liqDistancePct) < cfg.minLiqDistancePct);
  if (near) {
    return {
      action: "pause",
      rule: "liq_distance",
      reason: "referee:liq_distance",
      staleCount: 0,
      detail: `${near.market} is ${near.liqDistancePct}% from liquidation (< ${cfg.minLiqDistancePct}%)`,
    };
  }
  return { action: "ok", staleCount: 0, detail: `weekly ${pnl}% (limit −${limitPct}%), ${risk.positions.length} position(s) safe` };
}
