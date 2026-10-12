import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, toBytes } from 'viem';
import { canonicalJSON } from '@leash/shared/canonical';
import { receiptFixtures } from '../demo/fixtures';
import { verifyReceipt } from '../lib/verify';
import { receiptDetailSchema, txRequestSchema } from '../lib/schemas';
const fixture = receiptFixtures[1]!;
test('canonicalization agrees with a pinned independent Keccak vector', () => {
  const value = {
    intent: { sizeUsd: '25', leverage: 5 },
    decision: { reasons: ['LEVERAGE_EXCEEDS'], allowed: false },
  };
  assert.equal(
    canonicalJSON(value),
    '{"decision":{"allowed":false,"reasons":["LEVERAGE_EXCEEDS"]},"intent":{"leverage":5,"sizeUsd":"25"}}',
  );
  assert.equal(
    keccak256(toBytes(canonicalJSON(value))),
    '0xe69ef3f1ee8b1e1a8c2b2c4b013f219abb581c068984c5d74612685c2b98a458',
  );
});
test('fixture is a sample, never an onchain verified receipt', () => {
  const result = verifyReceipt(fixture.detail!, fixture, true);
  assert.equal(result.state, 'sample');
  assert.equal(result.latencyMs, 900);
  assert.ok(!result.label.includes('✓'));
});
test('matching independent indexed anchor is verified only in live mode', () => {
  assert.equal(verifyReceipt(fixture.detail!, fixture, false).state, 'verified');
});
for (const [name, change] of [
  [
    'size',
    (d: typeof fixture.detail) => {
      d!.intent.sizeUsd = '999';
    },
  ],
  [
    'decision',
    (d: typeof fixture.detail) => {
      d!.decision.allowed = false;
    },
  ],
  [
    'slack',
    (d: typeof fixture.detail) => {
      d!.decision.usedSlack = true;
    },
  ],
  [
    'rationale',
    (d: typeof fixture.detail) => {
      d!.intent.rationale = 'Rewritten after execution';
    },
  ],
  [
    'signals',
    (d: typeof fixture.detail) => {
      d!.signalsSnapshot.smartMoneyInflowUsd = '0';
    },
  ],
] as const)
  test(`tampering with ${name} visibly fails verification`, () => {
    const detail = structuredClone(fixture.detail)!;
    change(detail);
    assert.equal(verifyReceipt(detail, fixture, false).state, 'mismatch');
  });
test('the API cannot verify its own replacement hash against a different indexed anchor', () => {
  const detail = structuredClone(fixture.detail)!;
  detail.intent.sizeUsd = '100';
  detail.reasonHash = keccak256(
    toBytes(canonicalJSON({ intent: detail.intent, decision: detail.decision })),
  );
  assert.equal(verifyReceipt(detail, fixture, false).state, 'mismatch');
});
test('missing indexed receipt and unconfirmed receipt stay pending', () => {
  assert.equal(
    verifyReceipt(fixture.detail!, { reasonHash: null, signalHash: null }, false).state,
    'pending',
  );
  assert.equal(
    verifyReceipt({ ...fixture.detail!, confirmedAtMs: null }, fixture, false).state,
    'pending',
  );
});
test('receipt latency never claims a negative duration', () => {
  assert.equal(
    verifyReceipt({ ...fixture.detail!, confirmedAtMs: 0 }, fixture, false).state,
    'pending',
  );
});
test('external receipt must reference the same intent and decision', () => {
  assert.equal(
    receiptDetailSchema.safeParse({
      ...fixture.detail!,
      decision: { ...fixture.detail!.decision, intentId: '99999999-9999-4999-8999-999999999999' },
    }).success,
    false,
  );
});
test('prepared transactions reject wrong chain, implicit gas and malformed calldata', () => {
  const tx = {
    to: '0x1111111111111111111111111111111111111111',
    data: '0x',
    value: '0',
    gas: '21000',
    chainId: 143,
  };
  assert.equal(txRequestSchema.safeParse(tx).success, true);
  for (const change of [
    { chainId: 1 },
    { gas: '0' },
    { gas: undefined },
    { data: '0xa' },
    { value: '-1' },
  ])
    assert.equal(txRequestSchema.safeParse({ ...tx, ...change }).success, false);
});
