import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, toBytes } from 'viem';
import { canonicalJSON } from '@leash/shared/canonical';
import { compiledPolicy, recallPolicy, rememberPolicy } from '../lib/compiledPolicies';
import { defaultPolicy } from '../mocks/fixtures';

const hash = keccak256(toBytes(canonicalJSON(defaultPolicy)));
test('cached rules must match the onchain hash; caller edits cannot change the saved policy', () => {
  const account = '0x1111111111111111111111111111111111111111';
  const input = structuredClone(defaultPolicy);
  rememberPolicy(account, hash, input);
  input.maxLeverage = 100;
  const recalled = compiledPolicy(account, hash)!;
  assert.equal(recalled.maxLeverage, defaultPolicy.maxLeverage);
  recalled.markets.push('UNREVIEWED');
  assert.deepEqual(compiledPolicy(account, hash)?.markets, defaultPolicy.markets);
  assert.equal(compiledPolicy(account, `0x${'00'.repeat(32)}`), null);
  assert.throws(() => rememberPolicy(account, hash, input), /fingerprint/);
});
test('browser recovery validates stored rules and refuses a changed onchain fingerprint', (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const account = '0x2222222222222222222222222222222222222222';
  const key = `leash.policy.${account}`;
  const storage = new Map([[key, JSON.stringify(defaultPolicy)]]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  t.after(() =>
    original
      ? Object.defineProperty(globalThis, 'localStorage', original)
      : Reflect.deleteProperty(globalThis, 'localStorage'),
  );
  assert.deepEqual(recallPolicy(account), defaultPolicy);
  assert.deepEqual(compiledPolicy(account, hash), defaultPolicy);
  assert.equal(compiledPolicy(account, `0x${'ff'.repeat(32)}`), null);
  storage.set('leash.policy.invalid', '{broken json');
  assert.equal(recallPolicy('invalid'), undefined);
  storage.set('leash.policy.incomplete', JSON.stringify({ version: 1 }));
  assert.equal(recallPolicy('incomplete'), undefined);
});
