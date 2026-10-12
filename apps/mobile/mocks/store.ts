import {
  defaultPolicy,
  makeReceipt,
  mockData,
  createReceiptFixtures,
  createRiskFixture,
  createSlackFixture,
  pnlFixture,
} from './fixtures';
import type { IndexedReceipt, Policy, Persona } from '../lib/schemas';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function freshState() {
  const receipts = createReceiptFixtures();
  return {
    risk: createRiskFixture(),
    receipts,
    slack: createSlackFixture(receipts),
    policy: clone(defaultPolicy),
    state: 'ACTIVE',
    persona: 'falcon' as Persona['id'],
    grantExpiresAt: null as number | null,
    balanceMon: mockData.monBalance,
    cashUsd: mockData.cashUsd,
    nextSeq: Math.max(...receipts.map((r) => r.seq)) + 1,
    pnl: [...pnlFixture],
  };
}
export const demoStore = {
  ...freshState(),
  reset() {
    Object.assign(this, freshState());
  },
  requestSlack() {
    this.slack = createSlackFixture(this.receipts);
  },
  emptyPortfolio() {
    this.cashUsd = '0';
    this.balanceMon = 0;
    this.receipts = [];
    this.pnl = [];
    this.state = 'PAUSED';
    this.slack.status = 'DENIED';
    this.grantExpiresAt = null;
    this.risk = {
      ...this.risk,
      equityUsd: '0',
      collateralUsd: '0',
      marginUsedUsd: '0',
      fundingPaidUsd: '0',
      slackLeftUsd: '0',
      weeklyPnlPct: 0,
      positions: [],
      exposureByMarket: {},
    };
  },
  pause(reason = 'user') {
    this.state = 'PAUSED';
    this.grantExpiresAt = null;
    this.receipts.unshift({
      id: `demo-pause-${Date.now()}`,
      seq: this.nextSeq++,
      persona: this.persona,
      status: 'PAUSED',
      reasonHash: null,
      signalHash: null,
      createdAt: new Date().toISOString(),
      pauseReason: reason,
    } satisfies IndexedReceipt);
  },
  resume() {
    this.state = 'ACTIVE';
  },
  activate(policy: Policy, persona: Persona['id']) {
    this.policy = clone(policy);
    this.persona = persona;
    this.state = 'ACTIVE';
  },
  approveSlack() {
    if (this.state === 'PAUSED')
      throw new Error('Your trader is paused. Resume before approving slack.');
    if (this.slack.status !== 'PENDING' || Date.now() >= Date.parse(this.slack.expiresAt))
      throw new Error('This request has expired. Tap DEMO to create a fresh mock request.');
    this.slack.status = 'APPROVED';
    this.grantExpiresAt = Date.now() + this.slack.requested.durationSec * 1000;
    this.receipts.unshift(makeReceipt(this.nextSeq++, 'EXECUTED', this.persona, true));
  },
};
