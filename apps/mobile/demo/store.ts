import { defaultPolicy, makeReceipt, receiptFixtures, riskFixture, slackFixture } from './fixtures';
import type { IndexedReceipt, Policy, Persona } from '../lib/schemas';
export const demoStore = {
  risk: JSON.parse(JSON.stringify(riskFixture)) as typeof riskFixture,
  receipts: [...receiptFixtures],
  slack: { ...slackFixture },
  policy: { ...defaultPolicy },
  state: 'ACTIVE',
  persona: 'falcon' as Persona['id'],
  grantExpiresAt: null as number | null,
  balanceMon: 100,
  cashUsd: '1248.62',
  nextSeq: 414,
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
    this.policy = policy;
    this.persona = persona;
    this.state = 'ACTIVE';
  },
  approveSlack() {
    if (this.state === 'PAUSED')
      throw new Error('Your trader is paused. Resume before approving slack.');
    if (this.slack.status !== 'PENDING' || Date.now() >= Date.parse(this.slack.expiresAt))
      throw new Error('This request has expired. Ask your trader for a fresh request.');
    this.slack.status = 'APPROVED';
    this.grantExpiresAt = Date.now() + this.slack.requested.durationSec * 1000;
    this.receipts.unshift(makeReceipt(this.nextSeq++, 'EXECUTED', this.persona, true));
  },
};
