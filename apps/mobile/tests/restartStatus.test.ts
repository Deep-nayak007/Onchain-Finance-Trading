import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zeroHash, zeroAddress } from 'viem';

process.env.EXPO_PUBLIC_USE_MOCKS = 'false';
process.env.EXPO_PUBLIC_CHAIN_ID = '10143';
const account = '0x1111111111111111111111111111111111111111';
test('lost Brain records use onchain pause state without silently activating a trader', async (t) => {
  const [{ api }, { publicClient }] = await Promise.all([
    import('../lib/api'),
    import('../lib/chain'),
  ]);
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    calls.push(init.method ?? 'GET');
    return new Response(JSON.stringify({ error: 'unknown account' }), { status: 404 });
  });
  t.mock.method(publicClient, 'getChainId', async () => 10143);
  t.mock.method(publicClient, 'getBytecode', async () => '0x1234');
  let paused = true;
  let policyHash = `0x${'11'.repeat(32)}`;
  t.mock.method(publicClient, 'readContract', async () => ({
    policyHash,
    maxNotionalUsd6: 10000000n,
    maxLeverageX10: 10,
    maxWeeklyLossBps: 500,
    agentId: 2227n,
    agentWallet: zeroAddress,
    perplKey: zeroAddress,
    paused,
    updatedAt: 1n,
  }));
  assert.equal((await api.status(account)).state, 'PAUSED');
  paused = false;
  assert.equal((await api.status(account)).state, 'RECOVERY_REQUIRED');
  assert.equal((await api.status(account)).persona, 'falcon');
  policyHash = zeroHash;
  assert.equal((await api.status(account)).state, 'NOT_STARTED');
  assert.deepEqual(calls, ['GET', 'GET', 'GET', 'GET']);
});
