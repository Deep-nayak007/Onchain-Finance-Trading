import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewTransaction, finishReview, reviewSnapshot } from '../lib/transactionReview';
import { requireBindings } from '../integration/team';
import { defaultPolicy } from '../mocks/fixtures';
const tx = {
  to: '0x1111111111111111111111111111111111111111',
  data: '0x',
  value: '0',
  gas: '21000',
  chainId: 143,
} as const;
test('live mandate preparation refuses unavailable wallet or key before RPC or signing', async () => {
  await assert.rejects(
    requireBindings().prepareMandate(
      tx.to,
      {
        policy: defaultPolicy,
        policyHash: `0x${'11'.repeat(32)}`,
        leashCard: [],
        warnings: [],
        agentId: '0',
        agentWallet: null,
        perplKey: null,
      },
      'falcon',
    ),
    /unavailable/,
  );
});
test('transaction approval must be explicit and cancellation rejects without signing', async () => {
  const pending = reviewTransaction(tx);
  assert.ok(reviewSnapshot());
  const rejected = assert.rejects(pending, /cancelled/);
  finishReview(false);
  await rejected;
  assert.equal(reviewSnapshot(), null);
});
test('a second transaction cannot replace the pending review', async () => {
  const first = reviewTransaction(tx);
  await assert.rejects(reviewTransaction({ ...tx, value: '10' }), /current transaction/);
  assert.equal(reviewSnapshot()!.request.value, '0');
  finishReview(true);
  await first;
  assert.equal(reviewSnapshot(), null);
});
