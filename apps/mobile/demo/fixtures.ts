import { keccak256, toBytes } from 'viem';
import { canonicalJSON } from '@leash/shared/canonical';
import type {
  Policy,
  Persona,
  ReceiptDetail,
  IndexedReceipt,
  RiskSnapshot,
  SlackRequest,
  TraderStats,
} from '../lib/schemas';
export const demoAccount = '0x1111111111111111111111111111111111111111';
export const defaultPolicy: Policy = {
  version: 1,
  markets: ['MON-PERP'],
  venues: ['PERPL'],
  maxLeverage: 3,
  maxNotionalUsd: '25',
  maxTotalExposureUsd: '100',
  maxWeeklyLossPct: 5,
  maxTradesPerHour: 4,
  cooldownSec: 300,
  requireSmartMoneyAgreement: true,
  minConfidence: 0.7,
  sleeveUsd: '1000',
};
export const personas: Persona[] = [
  {
    id: 'falcon',
    agentId: 'demo-falcon',
    name: 'Falcon',
    style: 'Momentum. Follows smart money.',
    mode: 'LIVE',
    wallet: demoAccount,
    defaultPolicy,
  },
  {
    id: 'otter',
    agentId: 'demo-otter',
    name: 'Otter',
    style: 'Patient entries. Smaller steps.',
    mode: 'SHADOW',
    wallet: demoAccount,
    defaultPolicy: { ...defaultPolicy, maxLeverage: 2, maxNotionalUsd: '15', cooldownSec: 900 },
  },
  {
    id: 'owl',
    agentId: 'demo-owl',
    name: 'Owl',
    style: 'Collects funding. Keeps a hedge.',
    mode: 'SHADOW',
    wallet: demoAccount,
    defaultPolicy: {
      ...defaultPolicy,
      venues: ['PERPL', 'KURU'],
      markets: ['MON-PERP', 'MON/AUSD'],
    },
  },
];
const now = Date.now();
export function makeReceipt(
  seq: number,
  status: IndexedReceipt['status'],
  persona: Persona['id'] = 'falcon',
  usedSlack = false,
): IndexedReceipt {
  const ts = new Date(seq >= 414 ? Date.now() : now - (414 - seq) * 180000).toISOString();
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  const denied = status === 'REJECTED';
  const intent: ReceiptDetail['intent'] = {
    id,
    ts,
    persona,
    action: 'OPEN',
    venue: 'PERPL',
    market: 'MON-PERP',
    side: persona === 'owl' ? 'SHORT' : 'LONG',
    sizeUsd: '25',
    leverage: denied || usedSlack ? 5 : 3,
    confidence: 0.84,
    rationale: denied
      ? 'Smart money is buying, but 5x is beyond your 3x rule. Asked you for a narrow exception.'
      : 'Smart-money inflows rose while the order book held support. Size stays inside your rules.',
    signals: [
      { source: 'nansen', key: 'Smart-money inflow', value: '+$1.2M in 1 hour' },
      { source: 'perpl', key: 'Book imbalance', value: 'Buy side +18%' },
      { source: 'envio', key: 'Weekly risk used', value: '$31 of $50' },
    ],
  };
  const decision: ReceiptDetail['decision'] = {
    intentId: id,
    allowed: !denied,
    reasons: [denied ? 'LEVERAGE_EXCEEDS' : 'OK'],
    usedSlack,
    checkedAt: ts,
  };
  const signalsSnapshot = {
    smartMoneyInflowUsd: '1200000',
    bookImbalancePct: 18,
    weeklyRiskUsd: '31',
  };
  const detail: ReceiptDetail = {
    intent,
    decision,
    signalsSnapshot,
    model: 'demo-fixture',
    decidedAtMs: new Date(ts).getTime(),
    confirmedAtMs: new Date(ts).getTime() + 900,
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
export const receiptFixtures = [
  makeReceipt(413, 'REJECTED'),
  makeReceipt(412, 'EXECUTED'),
  makeReceipt(411, 'SHADOW', 'otter'),
  makeReceipt(410, 'SHADOW', 'owl'),
];
export const riskFixture: RiskSnapshot = {
  account: demoAccount,
  ts: new Date(now).toISOString(),
  equityUsd: '1248.62',
  collateralUsd: '1200',
  marginUsedUsd: '83.33',
  weeklyPnlPct: 4.1,
  fundingPaidUsd: '1.82',
  slackLeftUsd: '19',
  positions: [
    {
      market: 'MON-PERP',
      side: 'LONG',
      sizeUsd: '250',
      entryPrice: '0.0392',
      markPrice: '0.0418',
      liqPrice: '0.0271',
      liqDistancePct: 35.2,
      unrealizedPnlUsd: '16.58',
    },
  ],
  exposureByMarket: { 'MON-PERP': '250' },
};
export const slackFixture: SlackRequest = {
  id: '10000000-0000-4000-8000-000000000001',
  account: demoAccount,
  persona: 'falcon',
  intentId: receiptFixtures[0]!.detail!.intent.id,
  rule: 'LEVERAGE_EXCEEDS',
  requested: { maxLeverage: 5, maxNotionalUsd: '25', extraRiskUsd: '8', durationSec: 3600 },
  why: [
    { text: 'Smart-money inflows are up $1.2M this hour.', source: 'Nansen' },
    { text: 'Buy-side depth is 18% stronger.', source: 'Perpl' },
    { text: 'The position stays capped at $25.', source: 'Rules' },
  ],
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 600000).toISOString(),
  status: 'PENDING',
};
export const traderFixtures: TraderStats[] = personas.map((persona, i) => ({
  persona,
  sevenDayPct: [4.1, 2.6, 1.8][i]!,
  receipts: [412, 186, 204][i]!,
  maxDrawdownPct: [2.3, 1.1, 0.8][i]!,
}));
export const pnlFixture = [
  0, 2, 1, 5, 4, 9, 8, 7, 14, 12, 18, 22, 20, 28, 26, 34, 31, 38, 37, 42, 40, 48.62,
];
export const bookFixture = {
  bids: [
    ['0.0417', '4200'],
    ['0.0416', '3100'],
    ['0.0415', '5700'],
  ] as [string, string][],
  asks: [
    ['0.0419', '3800'],
    ['0.0420', '2900'],
    ['0.0421', '4900'],
  ] as [string, string][],
  ts: new Date(now).toISOString(),
};
