import { describe, expect, it } from "vitest";
import { evaluate, type RefereeInput } from "../src/rules";

const ok: RefereeInput = {
  mandate: { maxWeeklyLossBps: 1000, paused: false },
  risk: { weeklyPnlPct: "-2.5", positions: [{ market: "MON-PERP", liqDistancePct: "21.03" }] },
  health: { ok: true, cacheLagBlocks: 1 },
  staleCount: 0,
};

describe("Referee rules", () => {
  it("healthy → ok", () => expect(evaluate(ok).action).toBe("ok"));
  it("no mandate / already paused → skip", () => {
    expect(evaluate({ ...ok, mandate: null }).action).toBe("skip");
    expect(evaluate({ ...ok, mandate: { maxWeeklyLossBps: 1000, paused: true } }).action).toBe("skip");
  });
  it("weekly loss at the limit → pause referee:weekly_loss", () => {
    expect(evaluate({ ...ok, risk: { ...ok.risk!, weeklyPnlPct: "-10" } })).toMatchObject({ action: "pause", reason: "referee:weekly_loss" });
    expect(evaluate({ ...ok, risk: { ...ok.risk!, weeklyPnlPct: "-9.99" } }).action).toBe("ok");
  });
  it("position < 5% from liquidation → pause referee:liq_distance", () => {
    expect(evaluate({ ...ok, risk: { ...ok.risk!, positions: [{ market: "MON-PERP", liqDistancePct: "4.9" }] } })).toMatchObject({ action: "pause", reason: "referee:liq_distance" });
  });
  it("fails closed: 3 consecutive stale/failed reads → pause referee:stale", () => {
    const s1 = evaluate({ ...ok, health: null, staleCount: 0 });
    expect(s1).toMatchObject({ action: "ok", staleCount: 1 });
    const s2 = evaluate({ ...ok, risk: null, staleCount: s1.staleCount });
    expect(s2).toMatchObject({ action: "ok", staleCount: 2 });
    expect(evaluate({ ...ok, health: { ok: true, cacheLagBlocks: 999 }, staleCount: s2.staleCount })).toMatchObject({ action: "pause", reason: "referee:stale" });
  });
  it("a fresh good read resets the stale counter", () => {
    expect(evaluate({ ...ok, staleCount: 2 }).staleCount).toBe(0);
  });
});
