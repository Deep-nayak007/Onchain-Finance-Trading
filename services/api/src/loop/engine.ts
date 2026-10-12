// One tick: gather → propose (LLM or fallback) → checkIntent → (execute) → receipt → (slack request).
// The LLM never executes. Only checkIntent decides; the gateway and contracts re-check independently.
import {
  checkIntent,
  effectiveLimits,
  fromUsd6,
  reasonHash,
  signalHash,
  toUsd6,
  type Decision,
  type Intent,
  type PersonaId,
  type Policy,
  type ReceiptDetail,
  type SlackGrant,
} from "@leash/shared";
import type { Address, Hex } from "viem";
import type { MandateView, ReceiptStatus, Registry } from "../chain/contracts";
import type { Gateway } from "../exec/gateway";
import type { SpotExecutor } from "../exec/kuru";
import type { ChatJson } from "../llm/client";
import { proposeIntent } from "../llm/propose";
import { persona as personaOf } from "../personas";
import type { Pusher } from "../push/expo";
import type { Envio } from "../signals/envio";
import type { Nansen } from "../signals/nansen";
import { changedMeaningfully, gatherSnapshot, whyChips, type Snapshot } from "../signals/snapshot";
import { createSlackRequest, humanAsk, INTENT_FRESH_MS, livePending, shouldAskForSlack } from "../slack/requests";
import type { Store } from "../store/db";
import type { ReceiptSink } from "./receipts";

export type EngineDeps = {
  live: boolean;
  modelTick: string;
  store: Store;
  gateway: Gateway;
  nansen: Nansen;
  envio: Envio;
  chat: ChatJson | null;
  registry: Registry | null;
  sink: ReceiptSink;
  pusher: Pusher;
  spot: SpotExecutor | null;
  now?: () => number;
  log?: (msg: string) => void;
};

export type TickResult =
  | { kind: "stopped"; reason: string }
  | { kind: "skipped"; reason: string }
  | { kind: "hold"; intent: Intent; model: string }
  | { kind: "decided"; detail: ReceiptDetail; status: ReceiptStatus; slackRequestId?: string };

/** Mandate values onchain are authoritative for the three limits it stores. */
export function mergeMandate(policy: Policy, m: MandateView | null): Policy {
  if (!m) return policy;
  return { ...policy, maxLeverage: m.maxLeverage, maxNotionalUsd: m.maxNotionalUsd, maxWeeklyLossPct: m.maxWeeklyLossPct };
}

export class Engine {
  private readonly lastSnapshot = new Map<string, Snapshot>();
  private readonly now: () => number;
  private readonly log: (msg: string) => void;

  constructor(private readonly d: EngineDeps) {
    this.now = d.now ?? Date.now;
    this.log = d.log ?? ((m) => console.log(m));
  }

  // ---------------- live persona, per user ----------------
  /** Reads the Rules knot + signals for one user. Returns a stop/skip result, or the decision context. */
  private async context(account: Address) {
    const user = this.d.store.getUser(account);
    if (!user || user.state !== "RUNNING") return { stop: { kind: "stopped", reason: "not running" } as TickResult };

    let mandate: MandateView | null = null;
    let slack: SlackGrant | null = null;
    if (this.d.registry) {
      if (!(await this.d.registry.isActive(account))) {
        this.d.store.setUserState(account, "PAUSED");
        return { stop: { kind: "stopped", reason: "mandate inactive onchain" } as TickResult };
      }
      [mandate, slack] = await Promise.all([this.d.registry.getMandate(account), this.d.registry.activeSlack(account)]);
    }
    const policy = mergeMandate(user.policy, mandate);
    const market = policy.markets.find((m) => m.endsWith("-PERP")) ?? policy.markets[0]!;
    const now = this.now();
    const { snapshot, risk } = await gatherSnapshot(this.d, { account, market, now });
    if (!risk) {
      this.d.store.recordTick(account, undefined);
      return { stop: { kind: "skipped", reason: "risk unavailable (fail closed)" } as TickResult };
    }
    const state = {
      now,
      paused: false,
      positions: risk.positions.map((p) => ({ market: p.market, side: p.side, sizeUsd: p.sizeUsd })),
      totalExposureUsd: sumUsd(Object.values(risk.exposureByMarket)),
      weeklyPnlPct: Number(risk.weeklyPnlPct),
      equityUsd: risk.equityUsd.startsWith("-") ? "0" : risk.equityUsd,
      tradesLastHour: this.d.store.executedSince(account, now - 3_600_000).length,
      lastTradeAt: this.d.store.lastExecutedAt(account),
      smartMoneyScore: snapshot.smartMoneyScore,
    };
    return { ctx: { user, policy, slack, snapshot, state, now } };
  }

  async tickUser(account: Address): Promise<TickResult> {
    const c = await this.context(account);
    if (!c.ctx) return c.stop;
    const { user, policy, slack, snapshot, state, now } = c.ctx;
    const key = `user:${account.toLowerCase()}`;
    if (!changedMeaningfully(this.lastSnapshot.get(key), snapshot)) {
      this.d.store.recordTick(account, undefined);
      return { kind: "skipped", reason: "no meaningful change" };
    }
    this.lastSnapshot.set(key, snapshot);

    const limits = effectiveLimits(policy, slack, state);
    const proposal = await proposeIntent(this.d.chat, this.d.modelTick, { persona: user.persona, policy, limits, snapshot, now });
    if (proposal.llmError) this.log(`[tick ${short(account)}] LLM fallback: ${proposal.llmError}`);
    return this.decide(account, c.ctx, proposal.intent, proposal.model);
  }

  /** Dev/demo path: submit a hand-written intent through the exact same checker → receipt → slack path. */
  async submitIntent(account: Address, intent: Intent, model: string): Promise<TickResult> {
    const c = await this.context(account);
    if (!c.ctx) return c.stop;
    return this.decide(account, c.ctx, intent, model);
  }

  private async decide(account: Address, ctx: NonNullable<Awaited<ReturnType<Engine["context"]>>["ctx"]>, intent: Intent, model: string): Promise<TickResult> {
    const { user, policy, slack, snapshot, state, now } = ctx;
    const decision = checkIntent(policy, slack, state, intent);
    this.d.store.recordTick(account, decision);
    if (intent.action === "HOLD") return { kind: "hold", intent, model };

    const result = await this.executeAndReceipt({ account, persona: user.persona, intent, decision, snapshot, model });

    if (!decision.allowed && shouldAskForSlack(decision, intent, livePending(this.d.store, account, now))) {
      const req = createSlackRequest({ account, persona: user.persona, policy, intent, decision, why: whyChips(snapshot), now });
      if (req) {
        this.d.store.saveSlack(req, { intent, snapshot, model, decidedAt: now });
        await this.d.pusher.send(account, `${personaOf(user.persona).name} is asking for more leash`, humanAsk(req), { type: "slack", id: req.id }).catch(() => 0);
        return { ...result, slackRequestId: req.id };
      }
    }
    return result;
  }

  /** Executes if allowed (LIVE only), stores ReceiptDetail, commits it onchain. Never throws for venue errors. */
  async executeAndReceipt(a: { account: Address; persona: PersonaId; intent: Intent; decision: Decision; snapshot: Snapshot; model: string }): Promise<Extract<TickResult, { kind: "decided" }>> {
    const decidedAtMs = this.now();
    let status: ReceiptStatus = a.decision.allowed ? "EXECUTED" : "REJECTED";
    let execTxHash: Hex | null = null;

    if (a.decision.allowed && this.d.live) {
      try {
        // Re-check the Rules knot immediately before touching a venue.
        if (this.d.registry && !(await this.d.registry.isActive(a.account))) throw new Error("mandate inactive at execution time");
        execTxHash = await this.execute(a.account, a.persona, a.intent, a.snapshot);
      } catch (e) {
        status = "FAILED";
        this.log(`[exec ${short(a.account)}] ${(e as Error).message}`);
      }
    }

    const detail: ReceiptDetail = {
      reasonHash: reasonHash({ intent: a.intent, decision: a.decision }),
      signalHash: signalHash(a.snapshot),
      intent: a.intent,
      decision: a.decision,
      signalsSnapshot: a.snapshot,
      model: a.model,
      decidedAtMs,
      confirmedAtMs: null,
      execTxHash,
    };
    this.d.store.saveReceipt(detail, { account: a.account, status });

    try {
      const logged = await this.d.sink.logReceipt(a.persona, {
        user: a.account,
        intent: a.intent,
        price: a.snapshot.perpl?.mark ?? "0",
        status,
        usedSlack: a.decision.usedSlack,
        reasonHash: detail.reasonHash as Hex,
        signalHash: detail.signalHash as Hex,
        execTxHash,
      });
      if (logged) {
        detail.confirmedAtMs = logged.confirmedAtMs;
        this.d.store.updateReceipt(detail.reasonHash, { confirmedAtMs: logged.confirmedAtMs, logTxHash: logged.txHash });
      }
    } catch (e) {
      this.log(`[receipt ${short(a.account)}] logReceipt failed: ${(e as Error).message}`);
    }
    return { kind: "decided", detail, status };
  }

  private async execute(account: Address, persona: PersonaId, intent: Intent, snapshot: Snapshot): Promise<Hex> {
    if (intent.venue === "PERPL") {
      if (intent.side !== "LONG" && intent.side !== "SHORT") throw new Error("perp intent needs LONG/SHORT");
      const res = await this.d.gateway.execute({
        account,
        market: intent.market,
        side: intent.side,
        sizeUsd: intent.sizeUsd,
        price: snapshot.perpl?.mark ?? "0",
        leverage: intent.leverage,
        reduce_only: intent.action === "CLOSE" || intent.action === "REDUCE",
        idempotencyKey: intent.id,
      });
      return res.txHash as Hex;
    }
    if (!this.d.spot) throw new Error("Kuru spot executor not configured on this chain");
    return this.d.spot.swap({ user: account, persona, intent });
  }

  // ---------------- shadow personas (no user, no execution) ----------------
  async tickShadow(persona: PersonaId): Promise<TickResult> {
    const p = personaOf(persona);
    const policy = p.defaultPolicy;
    const market = policy.markets.find((m) => m.endsWith("-PERP")) ?? policy.markets[0]!;
    const now = this.now();
    const { snapshot } = await gatherSnapshot(this.d, { account: null, market, now });
    const key = `persona:${persona}`;
    if (!changedMeaningfully(this.lastSnapshot.get(key), snapshot)) return { kind: "skipped", reason: "no meaningful change" };
    this.lastSnapshot.set(key, snapshot);

    const state = {
      now,
      paused: false,
      positions: [],
      totalExposureUsd: "0",
      weeklyPnlPct: 0,
      tradesLastHour: this.d.store.executedSince(key, now - 3_600_000).length,
      lastTradeAt: this.d.store.lastExecutedAt(key),
      smartMoneyScore: snapshot.smartMoneyScore,
    };
    const proposal = await proposeIntent(this.d.chat, this.d.modelTick, { persona, policy, limits: effectiveLimits(policy, null, state), snapshot, now });
    const decision = checkIntent(policy, null, state, proposal.intent);
    if (proposal.intent.action === "HOLD") return { kind: "hold", intent: proposal.intent, model: proposal.model };
    if (!decision.allowed) return { kind: "skipped", reason: `shadow call denied: ${decision.reasons.join(",")}` };

    const detail: ReceiptDetail = {
      reasonHash: reasonHash({ intent: proposal.intent, decision }),
      signalHash: signalHash(snapshot),
      intent: proposal.intent,
      decision,
      signalsSnapshot: snapshot,
      model: proposal.model,
      decidedAtMs: now,
      confirmedAtMs: null,
      execTxHash: null,
    };
    // Shadow "trades" count toward the persona's own rate limit / cooldown (stored as EXECUTED under the persona key).
    this.d.store.saveReceipt(detail, { account: key, status: "EXECUTED" });
    try {
      const logged = await this.d.sink.logShadow(persona, BigInt(p.agentId), {
        intent: proposal.intent,
        price: snapshot.perpl?.mark ?? "0",
        usedSlack: false,
        reasonHash: detail.reasonHash as Hex,
        signalHash: detail.signalHash as Hex,
        execTxHash: null,
      });
      if (logged) {
        detail.confirmedAtMs = logged.confirmedAtMs;
        this.d.store.updateReceipt(detail.reasonHash, { confirmedAtMs: logged.confirmedAtMs, logTxHash: logged.txHash });
      }
    } catch (e) {
      this.log(`[shadow ${persona}] logShadow failed: ${(e as Error).message}`);
    }
    return { kind: "decided", detail, status: "SHADOW" };
  }

  // ---------------- slack approval ----------------
  /** Called after the user's grantSlack tx confirmed. Re-checks the original intent with the new slack and executes. */
  async approveSlack(id: string): Promise<{ status: "APPROVED" | "EXPIRED" | "NOT_ACTIVE"; receipt: ReceiptDetail | null }> {
    const rec = this.d.store.getSlack(id);
    if (!rec) throw new Error("not found");
    const { request } = rec;
    const saved = rec.intent as { intent: Intent; snapshot: Snapshot; model: string; decidedAt: number };
    const now = this.now();
    const account = request.account as Address;

    const slack = this.d.registry ? await this.d.registry.activeSlack(account) : null;
    if (this.d.registry && !slack) return { status: "NOT_ACTIVE", receipt: null };
    this.d.store.saveSlack({ ...request, status: "APPROVED" }, rec.intent);
    if (now - saved.decidedAt > INTENT_FRESH_MS) return { status: "EXPIRED", receipt: null };

    const user = this.d.store.getUser(account);
    if (!user) throw new Error("unknown user");
    const mandate = this.d.registry ? await this.d.registry.getMandate(account) : null;
    const policy = mergeMandate(user.policy, mandate);
    const risk = await this.d.gateway.risk(account).catch(() => null);
    if (!risk) return { status: "APPROVED", receipt: null };
    const effSlack = slack ?? { active: true, ...request.requested, expiresAt: Math.floor(now / 1000) + request.requested.durationSec };
    const decision = checkIntent(
      policy,
      effSlack,
      {
        now,
        paused: false,
        positions: risk.positions.map((p) => ({ market: p.market, side: p.side, sizeUsd: p.sizeUsd })),
        totalExposureUsd: sumUsd(Object.values(risk.exposureByMarket)),
        weeklyPnlPct: Number(risk.weeklyPnlPct),
        equityUsd: risk.equityUsd,
        tradesLastHour: this.d.store.executedSince(account, now - 3_600_000).length,
        lastTradeAt: this.d.store.lastExecutedAt(account),
        smartMoneyScore: saved.snapshot.smartMoneyScore,
      },
      saved.intent,
    );
    const res = await this.executeAndReceipt({ account, persona: user.persona, intent: saved.intent, decision, snapshot: saved.snapshot, model: saved.model });
    return { status: "APPROVED", receipt: res.detail };
  }
}

function sumUsd(values: string[]): string {
  return fromUsd6(values.reduce((a, v) => a + (toUsd6(v) < 0n ? -toUsd6(v) : toUsd6(v)), 0n));
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

