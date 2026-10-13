import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEther } from 'viem';
process.env.EXPO_PUBLIC_USE_MOCKS = 'false';
process.env.EXPO_PUBLIC_CHAIN_ID = '10143';
const account = '0x1111111111111111111111111111111111111111';
test('an already funded wallet can continue without requesting another gas drip', async (t) => {
  const [{ coverGas }, { publicClient }] = await Promise.all([
    import('../lib/gas'),
    import('../lib/chain'),
  ]);
  t.mock.method(publicClient, 'getChainId', async () => 10143);
  t.mock.method(publicClient, 'getBalance', async () => parseEther('0.2'));
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new Error('gas tank empty');
  });
  await coverGas(account);
  assert.equal(calls, 0);
});
test('failed kill cleanup does not report the wallet and key as revoked', async (t) => {
  const { api } = await import('../lib/api');
  let wallet = false;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          state: 'KILLED',
          persona: 'falcon',
          lastTick: null,
          lastDecision: null,
          cleanup: { wallet, gatewayKey: true },
        }),
      ),
  );
  await assert.rejects(api.kill(account), /backend cleanup is incomplete/);
  wallet = true;
  assert.equal((await api.kill(account)).state, 'KILLED');
});
