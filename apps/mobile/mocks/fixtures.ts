import { keccak256, toBytes } from 'viem';
import { z } from 'zod';
import data from './data.json';
import { canonicalJSON } from './canonical';
import {
  addressSchema,
  personaSchema,
  policySchema,
  riskSchema,
  slackSchema,
  type ReceiptDetail,
  type IndexedReceipt,
  type Persona,
  type TraderStats,
} from '../lib/schemas';

// All editable sample values live in data.json. Dates and hashes are generated locally.
export const mockData = data;
export const demoAccount = addressSchema.parse(data.account) as `0x${string}`;
export const defaultPolicy = policySchema.parse(data.policy);
export const traderFixtures: TraderStats[] = data.traders.map((trader) => ({
  ...trader,
  persona: personaSchema.parse(trader.persona),
}));
export const personas: Persona[] = traderFixtures.map((trader) => trader.persona);
const receiptStatus = z.enum(['EXECUTED', 'REJECTED', 'FAILED', 'SHADOW']);
const personaId = z.enum(['falcon', 'otter', 'owl']);
export function makeReceipt(
  seq: number,
  status: IndexedReceipt['status'],
  persona: Persona['id'] = 'falcon',
  usedSlack = false,
): IndexedReceipt {
  const ts = new Date(Date.now() - (seq >= 414 ? 0 : (414 - seq) * 180000)).toISOString();
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  const denied = status === 'REJECTED';
  const template = data.receiptTemplate;
  const intent: ReceiptDetail['intent'] = {
    id,
    ts,
    persona,
    action: 'OPEN',
    venue: 'PERPL',
    market: 'MON-PERP',
    side: persona === 'owl' ? 'SHORT' : 'LONG',
    sizeUsd: template.sizeUsd,
    leverage: denied || usedSlack ? data.slack.requested.maxLeverage : defaultPolicy.maxLeverage,
    confidence: template.confidence,
    rationale: denied ? template.deniedRationale : template.rationale,
    signals: template.signals.map((signal) => ({
      ...signal,
      source: z.enum(['nansen', 'envio', 'perpl']).parse(signal.source),
    })),
  };
  const decision: ReceiptDetail['decision'] = {
    intentId: id,
    allowed: !denied,
    reasons: [denied ? 'LEVERAGE_EXCEEDS' : 'OK'],
    usedSlack,
    checkedAt: ts,
  };
  const signalsSnapshot = { ...template.signalsSnapshot };
  const detail: ReceiptDetail = {
    intent,
    decision,
    signalsSnapshot,
    model: 'demo-fixture',
    decidedAtMs: Date.parse(ts),
    confirmedAtMs: Date.parse(ts) + template.confirmationDelayMs,
    execTxHash: null,
    reasonHash: keccak256(toBytes(canonicalJSON({ intent, decision }))),
    signalHash: keccak256(toBytes(canonicalJSON(signalsSnapshot))),
  };
  return {
    id: `demo-${seq}`,
    seq,
    status,
    persona,
    createdAt: ts,
    reasonHash: detail.reasonHash,
    signalHash: detail.signalHash,
    detail,
  };
}
export const createReceiptFixtures = () =>
  data.receipts.map((row) =>
    makeReceipt(row.seq, receiptStatus.parse(row.status), personaId.parse(row.persona)),
  );
export const receiptFixtures = createReceiptFixtures();
export const createRiskFixture = () =>
  riskSchema.parse({
    ...data.risk,
    account: demoAccount,
    ts: Math.floor(Date.now() / 1000),
    weeklyPnlPct: String(data.risk.weeklyPnlPct),
    positions: data.risk.positions.map((p) => ({ ...p, liqDistancePct: String(p.liqDistancePct) })),
  });
export const riskFixture = createRiskFixture();
export function createSlackFixture(receipts: IndexedReceipt[] = receiptFixtures) {
  const now = Date.now();
  const denied = receipts.find((row) => row.status === 'REJECTED' && row.detail);
  if (!denied?.detail)
    throw new Error('mocks/data.json needs a denied receipt for the slack scenario.');
  return slackSchema.parse({
    ...data.slack,
    account: demoAccount,
    intentId: denied.detail.intent.id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + data.slack.requestTtlSec * 1000).toISOString(),
  });
}
export const slackFixture = createSlackFixture();
export const pnlFixture = [...data.pnl];
const level = z.tuple([z.string().regex(/^\d+(?:\.\d+)?$/), z.string().regex(/^\d+(?:\.\d+)?$/)]);
export const bookFixture = {
  ...z.object({ bids: z.array(level), asks: z.array(level) }).parse(data.book),
  ts: new Date().toISOString(),
};
