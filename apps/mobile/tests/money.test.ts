import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usd6, validAmount } from '../lib/money';
test('dollars convert to exact integer units without floating point loss', () => {
  assert.equal(usd6('0.1'), 100000n);
  assert.equal(usd6('25.000001'), 25000001n);
  assert.equal(usd6('0.000001'), 1n);
});
test('invalid amounts and demo cap are rejected before preparing a transaction', () => {
  for (const amount of ['-1', 'NaN', '1e2', '.5', '1.0000001', '0', '25.01'])
    assert.equal(validAmount(amount), false);
  assert.equal(validAmount('25'), true);
  assert.equal(validAmount('0.01'), true);
});
