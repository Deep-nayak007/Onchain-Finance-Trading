/**
 * LEASH Envio handlers.
 *
 * Builds the data layer every screen reads (ARCHITECTURE §7.5): the receipts
 * feed, mandate/slack state, pauses, and the agent leaderboard with executed /
 * rejected / shadow counts and traded volume.
 *
 * Conventions:
 * - Receipt.id = `${txHash}-${logIndex}` (RAILS Envio notes).
 * - Shadow receipts are counted toward an agent only when the emitter (`user`,
 *   which logShadow forces to msg.sender) is a known persona wallet.
 * - PnL fields (realizedPnlUsd, shadowPnlUsd, maxDrawdownPct) and PnlSnapshot
 *   are populated once Perpl fills + Kuru trades are indexed at CP3; until then
 *   they stay at their defaults.
 */
import {
  MandateRegistry,
  ReceiptLog,
  type Agent,
  type User,
} from "generated";

// Status / venue enum decoding (uint8 on-chain).
const STATUS = ["EXECUTED", "REJECTED", "FAILED", "SHADOW"] as const;
const VENUE = ["PERPL", "KURU"] as const;

// Known persona wallets (lowercased). Filled from addresses.ts PERSONAS at CP1;
// Envio counts a shadow receipt only when its emitter is one of these.
const PERSONA_WALLETS = new Set<string>(
  [
    // process.env values injected at deploy time, or hard-coded post-CP1:
    // "0x....falcon", "0x....otter", "0x....owl",
  ].map((a) => a.toLowerCase())
);

const ZERO = BigInt(0);

async function loadUser(context: any, id: string): Promise<User> {
  const existing = await context.User.get(id);
  if (existing) return existing;
  const user: User = {
    id,
    mandate_id: undefined,
    activeAgentId: undefined,
    firstSeenBlock: ZERO,
    updatedAt: ZERO,
  };
  context.User.set(user);
  return user;
}

async function loadAgent(context: any, agentId: bigint): Promise<Agent> {
  const id = agentId.toString();
  const existing = await context.Agent.get(id);
  if (existing) return existing;
  const agent: Agent = {
    id,
    executed: 0,
    rejected: 0,
    shadow: 0,
    volumeUsd: 0,
    realizedPnlUsd: 0,
    shadowPnlUsd: 0,
    maxDrawdownPct: 0,
  };
  context.Agent.set(agent);
  return agent;
}

// ---- MandateRegistry ----

MandateRegistry.MandateSet.handler(async ({ event, context }) => {
  const userId = event.params.user.toLowerCase();
  const user = await loadUser(context, userId);
  context.User.set({
    ...user,
    firstSeenBlock: user.firstSeenBlock === ZERO ? BigInt(event.block.number) : user.firstSeenBlock,
    activeAgentId: event.params.agentId,
    updatedAt: BigInt(event.block.timestamp),
    mandate_id: userId,
  });

  context.Mandate.set({
    id: userId,
    user_id: userId,
    agentId: event.params.agentId,
    policyHash: event.params.policyHash,
    maxNotionalUsd6: event.params.maxNotionalUsd6,
    maxLeverageX10: Number(event.params.maxLeverageX10),
    maxWeeklyLossBps: Number(event.params.maxWeeklyLossBps),
    agentWallet: event.params.agentWallet.toLowerCase(),
    perplKey: event.params.perplKey.toLowerCase(),
    paused: false, // setMandate always unpauses
    updatedAt: BigInt(event.block.timestamp),
  });

  // Ensure the agent entity exists for the leaderboard.
  await loadAgent(context, event.params.agentId);
});

MandateRegistry.SlackGranted.handler(async ({ event, context }) => {
  const userId = event.params.user.toLowerCase();
  await loadUser(context, userId);
  const id = `${event.transaction.hash}-${event.logIndex}`;
  context.SlackGrant.set({
    id,
    user_id: userId,
    maxLeverageX10: Number(event.params.maxLeverageX10),
    maxNotionalUsd6: event.params.maxNotionalUsd6,
    extraRiskUsd6: event.params.extraRiskUsd6,
    expiresAt: event.params.expiresAt,
    grantedAt: BigInt(event.block.timestamp),
    revokedAt: undefined,
    active: true,
  });
});

MandateRegistry.SlackRevoked.handler(async ({ event, context }) => {
  // Mark the user's active grants revoked. (Handlers process one event at a
  // time; the feed query filters active=true, so stale grants simply drop out.)
  const userId = event.params.user.toLowerCase();
  const grants = await context.SlackGrant.getWhere.user_id.eq(userId);
  for (const g of grants) {
    if (g.active) {
      context.SlackGrant.set({ ...g, active: false, revokedAt: BigInt(event.block.timestamp) });
    }
  }
});

MandateRegistry.Paused.handler(async ({ event, context }) => {
  const userId = event.params.user.toLowerCase();
  const user = await loadUser(context, userId);
  const mandate = await context.Mandate.get(userId);
  if (mandate) context.Mandate.set({ ...mandate, paused: true });
  context.User.set({ ...user, updatedAt: BigInt(event.block.timestamp) });

  context.PauseEvent.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    user_id: userId,
    by: event.params.by.toLowerCase(),
    reason: event.params.reason,
    blockTimestamp: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
  });

  // A pause clears slack on-chain; reflect it here too.
  const grants = await context.SlackGrant.getWhere.user_id.eq(userId);
  for (const g of grants) {
    if (g.active) {
      context.SlackGrant.set({ ...g, active: false, revokedAt: BigInt(event.block.timestamp) });
    }
  }
});

MandateRegistry.Resumed.handler(async ({ event, context }) => {
  const userId = event.params.user.toLowerCase();
  const mandate = await context.Mandate.get(userId);
  if (mandate) context.Mandate.set({ ...mandate, paused: false });
});

// ---- ReceiptLog ----

ReceiptLog.TradeReceipt.handler(async ({ event, context }) => {
  const userId = event.params.user.toLowerCase();
  await loadUser(context, userId);
  const agent = await loadAgent(context, event.params.agentId);

  const status = STATUS[Number(event.params.status)] ?? "FAILED";
  const venue = VENUE[Number(event.params.venue)] ?? "PERPL";
  const sizeUsd = Number(event.params.sizeUsd6) / 1e6;

  const id = `${event.transaction.hash}-${event.logIndex}`;
  context.Receipt.set({
    id,
    user_id: userId,
    agent_id: agent.id,
    agentId: event.params.agentId,
    seq: event.params.seq,
    venue,
    market: event.params.market,
    marketName: undefined,
    side: Number(event.params.side),
    sizeUsd6: event.params.sizeUsd6,
    price1e18: event.params.price1e18,
    status,
    usedSlack: event.params.usedSlack,
    reasonHash: event.params.reasonHash,
    signalHash: event.params.signalHash,
    execTxHash: event.params.execTxHash,
    blockNumber: BigInt(event.block.number),
    blockTimestamp: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
  });

  // Leaderboard counters.
  const patch: Partial<Agent> = {};
  if (status === "EXECUTED") {
    patch.executed = agent.executed + 1;
    patch.volumeUsd = agent.volumeUsd + sizeUsd;
  } else if (status === "REJECTED") {
    patch.rejected = agent.rejected + 1;
  } else if (status === "SHADOW") {
    // Count a shadow only from a known persona wallet (logShadow forces
    // user = msg.sender, so `user` here is the emitter).
    if (PERSONA_WALLETS.size === 0 || PERSONA_WALLETS.has(userId)) {
      patch.shadow = agent.shadow + 1;
    }
  }
  context.Agent.set({ ...agent, ...patch });
});
