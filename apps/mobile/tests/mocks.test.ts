import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoStore } from '../mocks/store';
import { mockData } from '../mocks/fixtures';
import { receiptDetailSchema, riskSchema, slackSchema } from '../lib/schemas';
import { verifyReceipt } from '../lib/verify';
test('the single mock dataset yields valid snapshots and honestly checked sample receipts', () => {
  demoStore.reset();
  const risk = demoStore.risk;
  assert.deepEqual(
    riskSchema.parse({
      ...risk,
      weeklyPnlPct: String(risk.weeklyPnlPct),
      positions: risk.positions.map((p) => ({ ...p, liqDistancePct: String(p.liqDistancePct) })),
    }),
    risk,
  );
  assert.ok(slackSchema.safeParse(demoStore.slack).success);
  for (const row of demoStore.receipts) {
    assert.ok(receiptDetailSchema.safeParse(row.detail).success);
    assert.equal(verifyReceipt(row.detail!, row, true).state, 'sample');
  }
});
test('reset recovers an emptied, paused portfolio and gives its request a fresh expiry', () => {
  demoStore.emptyPortfolio();
  assert.equal(demoStore.receipts.length, 0);
  assert.equal(demoStore.risk.positions.length, 0);
  assert.equal(demoStore.pnl.length, 0);
  const before = Date.now();
  demoStore.reset();
  assert.equal(demoStore.cashUsd, mockData.cashUsd);
  assert.equal(demoStore.state, 'ACTIVE');
  assert.equal(demoStore.receipts.length, mockData.receipts.length);
  assert.ok(demoStore.risk.positions.length > 0);
  assert.ok(demoStore.pnl.length > 0);
  assert.ok(Date.parse(demoStore.slack.expiresAt) >= before + mockData.slack.requestTtlSec * 1000);
});
test('an expired mock request rejects approval until the tester renews it', () => {
  demoStore.reset();
  demoStore.slack.expiresAt = new Date(Date.now() - 60000).toISOString();
  assert.throws(() => demoStore.approveSlack(), /expired/);
  demoStore.requestSlack();
  demoStore.approveSlack();
  assert.equal(demoStore.slack.status, 'APPROVED');
  assert.equal(demoStore.receipts[0]!.status, 'EXECUTED');
  assert.equal(demoStore.receipts[0]!.detail!.decision.usedSlack, true);
  demoStore.reset();
  assert.equal(demoStore.slack.status, 'PENDING');
  assert.equal(demoStore.grantExpiresAt, null);
});
