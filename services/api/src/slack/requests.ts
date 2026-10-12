// Slack requests: when the checker denies a confident intent ONLY for a limit the user can widen,
// the trader asks for a narrow, expiring exception (minimum needed). One pending per user, TTL 10 min.
import { randomUUID } from "node:crypto";
import { fromUsd6, isSlackable, toUsd6, type Decision, type Intent, type Policy, type SlackRequest } from "@leash/shared";
import type { Store } from "../store/db";

export const SLACK_TTL_MS = 10 * 60_000;
export const SLACK_MIN_CONFIDENCE = 0.7;
export const SLACK_DURATION_SEC = 3600;
export const SLACK_MAX = { leverage: 5, notionalUsd: "100", extraRiskUsd: "8" } as const;
/** Approval must arrive while the original intent is still fresh. */
export const INTENT_FRESH_MS = 2 * 60_000;

export function shouldAskForSlack(decision: Decision, intent: Intent, pending: SlackRequest[]): boolean {
  return isSlackable(decision) && intent.confidence >= SLACK_MIN_CONFIDENCE && pending.length === 0;
}

/** The minimum ask that would let this intent pass, within demo maxima. */
export function slackAsk(policy: Policy, intent: Intent): SlackRequest["requested"] | null {
  const lev = Math.max(policy.maxLeverage, Math.ceil(intent.leverage * 10) / 10);
  const notional6 = toUsd6(intent.sizeUsd) > toUsd6(policy.maxNotionalUsd) ? toUsd6(intent.sizeUsd) : toUsd6(policy.maxNotionalUsd);
  if (lev > SLACK_MAX.leverage || notional6 > toUsd6(SLACK_MAX.notionalUsd)) return null; // never ask beyond the hard cap
  // Extra risk: 10% of the trade's notional, capped at $8.
  const extra6 = toUsd6(intent.sizeUsd) / 10n;
  const cap6 = toUsd6(SLACK_MAX.extraRiskUsd);
  return {
    maxLeverage: lev,
    maxNotionalUsd: fromUsd6(notional6),
    extraRiskUsd: fromUsd6(extra6 < cap6 ? extra6 : cap6),
    durationSec: SLACK_DURATION_SEC,
  };
}

export function createSlackRequest(args: {
  account: string;
  persona: string;
  policy: Policy;
  intent: Intent;
  decision: Decision;
  why: SlackRequest["why"];
  now: number;
}): SlackRequest | null {
  const requested = slackAsk(args.policy, args.intent);
  if (!requested) return null;
  return {
    id: randomUUID(),
    account: args.account,
    persona: args.persona,
    intentId: args.intent.id,
    rule: args.decision.reasons[0]!,
    requested,
    why: args.why.slice(0, 3),
    createdAt: new Date(args.now).toISOString(),
    expiresAt: new Date(args.now + SLACK_TTL_MS).toISOString(),
    status: "PENDING",
  };
}

/** Marks stale PENDING requests EXPIRED; returns the live pending list. */
export function livePending(store: Store, account: string, now = Date.now()): SlackRequest[] {
  return store.pendingSlack(account).filter((r) => {
    if (Date.parse(r.expiresAt) > now) return true;
    const rec = store.getSlack(r.id);
    if (rec) store.saveSlack({ ...r, status: "EXPIRED" }, rec.intent);
    return false;
  });
}

export function humanAsk(r: SlackRequest): string {
  return `${r.requested.maxLeverage}x up to $${r.requested.maxNotionalUsd} for ${Math.round(r.requested.durationSec / 60)} min`;
}
