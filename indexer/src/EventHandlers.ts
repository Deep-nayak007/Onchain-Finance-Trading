/**
 * LEASH Envio handlers (HyperIndex V3 / envio 3.14 API).
 *
 * Builds the data layer every screen reads (ARCHITECTURE §7.5): the receipts
 * feed, mandate/slack state, pauses, and the agent leaderboard with executed /
 * rejected / shadow counts and traded volume.
 *
 * V3 API notes:
 * - Handlers register via `indexer.onEvent({ contract, event }, handler)` from
 *   the `envio` module (the old `generated` module + `Contract.Event.handler`
 *   API was removed after the 3.0 release candidates).
 * - `context.<Entity>.{get,set,getOrCreate,getWhere}` is unchanged.
 * - `package.json` must have `"type": "module"` (envio 3.14 loads handlers as ESM).
 *
 * Conventions:
 * - Receipt.id = `${txHash}-${logIndex}` (RAILS Envio notes).
 * - Shadow receipts count toward an agent only when the emitter (`user`, which
 *   logShadow forces to msg.sender) is a known persona wallet.
 * - PnL fields and PnlSnapshot are populated at CP3 once Perpl fills + Kuru
 *   trades are indexed; until then they keep their defaults.
 */
import { indexer } from "envio";

// Status / venue enum decoding (uint8 on-chain, arrives as bigint).
const STATUS = ["EXECUTED", "REJECTED", "FAILED", "SHADOW"] as const;
const VENUE = ["PERPL", "KURU"] as const;

// Known persona wallets (lowercased). Fill from addresses.ts PERSONAS at CP1;
// Envio counts a shadow receipt only when its emitter is one of these.
const PERSONA_WALLETS = new Set<string>(
  ([] as string[]).map((a) => a.toLowerCase())
);

// ---- MandateRegistry ----

indexer.onEvent(
  { contract: "MandateRegistry", event: "MandateSet" },
  async ({ event, context }) => {
    const userId = event.params.user.toLowerCase();
    const existing = await context.User.get(userId);
    context.User.set({
      id: userId,
      firstSeenBlock: existing?.firstSeenBlock ?? BigInt(event.block.number),
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
    const agentId = event.params.agentId.toString();
    await context.Agent.getOrCreate({
      id: agentId,
      executed: 0,
      rejected: 0,
      shadow: 0,
      volumeUsd: 0,
      realizedPnlUsd: 0,
      shadowPnlUsd: 0,
      maxDrawdownPct: 0,
    });
  }
);

indexer.onEvent(
  { contract: "MandateRegistry", event: "SlackGranted" },
  async ({ event, context }) => {
    const userId = event.params.user.toLowerCase();
    await context.User.getOrCreate({
      id: userId,
      firstSeenBlock: BigInt(event.block.number),
      activeAgentId: undefined,
      updatedAt: BigInt(event.block.timestamp),
      mandate_id: undefined,
    });
    context.SlackGrant.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      user_id: userId,
      maxLeverageX10: Number(event.params.maxLeverageX10),
      maxNotionalUsd6: event.params.maxNotionalUsd6,
      extraRiskUsd6: event.params.extraRiskUsd6,
      expiresAt: event.params.expiresAt,
      grantedAt: BigInt(event.block.timestamp),
      revokedAt: undefined,
      active: true,
    });
  }
);

indexer.onEvent(
  { contract: "MandateRegistry", event: "SlackRevoked" },
  async ({ event, context }) => {
    const userId = event.params.user.toLowerCase();
    const grants = await context.SlackGrant.getWhere({ user_id: { _eq: userId } });
    for (const g of grants) {
      if (g.active) {
        context.SlackGrant.set({
          ...g,
          active: false,
          revokedAt: BigInt(event.block.timestamp),
        });
      }
    }
  }
);

indexer.onEvent(
  { contract: "MandateRegistry", event: "Paused" },
  async ({ event, context }) => {
    const userId = event.params.user.toLowerCase();
    const mandate = await context.Mandate.get(userId);
    if (mandate) context.Mandate.set({ ...mandate, paused: true });

    context.PauseEvent.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      user_id: userId,
      by: event.params.by.toLowerCase(),
      reason: event.params.reason,
      blockTimestamp: BigInt(event.block.timestamp),
      txHash: event.transaction.hash,
    });

    // A pause clears slack on-chain; reflect it here too.
    const grants = await context.SlackGrant.getWhere({ user_id: { _eq: userId } });
    for (const g of grants) {
      if (g.active) {
        context.SlackGrant.set({
          ...g,
          active: false,
          revokedAt: BigInt(event.block.timestamp),
        });
      }
    }
  }
);

indexer.onEvent(
  { contract: "MandateRegistry", event: "Resumed" },
  async ({ event, context }) => {
    const userId = event.params.user.toLowerCase();
    const mandate = await context.Mandate.get(userId);
    if (mandate) context.Mandate.set({ ...mandate, paused: false });
  }
);

// ---- ReceiptLog ----

indexer.onEvent(
  { contract: "ReceiptLog", event: "TradeReceipt" },
  async ({ event, context }) => {
    const userId = event.params.user.toLowerCase();
    await context.User.getOrCreate({
      id: userId,
      firstSeenBlock: BigInt(event.block.number),
      activeAgentId: undefined,
      updatedAt: BigInt(event.block.timestamp),
      mandate_id: undefined,
    });

    const agentId = event.params.agentId.toString();
    const agent = await context.Agent.getOrCreate({
      id: agentId,
      executed: 0,
      rejected: 0,
      shadow: 0,
      volumeUsd: 0,
      realizedPnlUsd: 0,
      shadowPnlUsd: 0,
      maxDrawdownPct: 0,
    });

    const status = STATUS[Number(event.params.status)] ?? "FAILED";
    const venue = VENUE[Number(event.params.venue)] ?? "PERPL";
    const sizeUsd = Number(event.params.sizeUsd6) / 1e6;

    context.Receipt.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      user_id: userId,
      agent_id: agentId,
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
    let { executed, rejected, shadow, volumeUsd } = agent;
    if (status === "EXECUTED") {
      executed += 1;
      volumeUsd += sizeUsd;
    } else if (status === "REJECTED") {
      rejected += 1;
    } else if (status === "SHADOW") {
      // logShadow forces user = msg.sender, so `userId` is the emitter.
      if (PERSONA_WALLETS.size === 0 || PERSONA_WALLETS.has(userId)) {
        shadow += 1;
      }
    }
    context.Agent.set({ ...agent, executed, rejected, shadow, volumeUsd });
  }
);

// ---- Kuru spot (CP3) ----
//
// Enable once the Kuru MON/AUSD order-book address is known (Q3). Uncomment the
// KuruOrderBook contract block in config.yaml, run `pnpm codegen`, then:
//
// indexer.onEvent(
//   { contract: "KuruOrderBook", event: "Trade" },
//   async ({ event, context }) => {
//     context.KuruTrade.set({
//       id: `${event.transaction.hash}-${event.logIndex}`,
//       account: event.params.takerAddress.toLowerCase(),
//       market: event.srcAddress.toLowerCase(),
//       side: event.params.isBuy ? 1 : -1,
//       baseAmount: 0,  // scaled once MON/AUSD decimals are confirmed (Q3)
//       quoteAmount: 0,
//       price: Number(event.params.price),
//       blockTimestamp: BigInt(event.block.timestamp),
//       txHash: event.transaction.hash,
//     });
//   }
// );