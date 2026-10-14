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
test('a lost funding response recovers from the confirmed wallet balance', async (t) => {
  const [{ coverGas }, { publicClient }, { api }, { ServiceConnectionError }] = await Promise.all([
    import('../lib/gas'),
    import('../lib/chain'),
    import('../lib/api'),
    import('../lib/http'),
  ]);
  let balanceReads = 0;
  let drips = 0;
  t.mock.method(publicClient, 'getChainId', async () => 10143);
  t.mock.method(publicClient, 'getBalance', async () =>
    ++balanceReads === 1 ? 0n : parseEther('0.05'),
  );
  t.mock.method(api, 'drip', async () => {
    drips++;
    throw new ServiceConnectionError('https://leash-brain-api.onrender.com');
  });
  await coverGas(account);
  assert.equal(balanceReads, 2);
  assert.equal(drips, 1);
});
test('an empty gas tank remains an actionable backend error', async (t) => {
  const [{ coverGas }, { publicClient }, { api }, { ServiceError }] = await Promise.all([
    import('../lib/gas'),
    import('../lib/chain'),
    import('../lib/api'),
    import('../lib/http'),
  ]);
  t.mock.method(publicClient, 'getChainId', async () => 10143);
  t.mock.method(publicClient, 'getBalance', async () => 0n);
  t.mock.method(api, 'drip', async () => {
    throw new ServiceError(503, 'gas tank is empty; ask the team to refill it');
  });
  await assert.rejects(coverGas(account), /gas tank is empty/);
});
test('a blocked RPC is identified before any gas request is made', async (t) => {
  const [{ coverGas }, { publicClient }, { api }] = await Promise.all([
    import('../lib/gas'),
    import('../lib/chain'),
    import('../lib/api'),
  ]);
  let drips = 0;
  t.mock.method(publicClient, 'getChainId', async () => {
    throw new TypeError('Failed to fetch');
  });
  t.mock.method(api, 'drip', async () => {
    drips++;
    return null;
  });
  await assert.rejects(coverGas(account), /Could not read your wallet on Monad testnet/);
  assert.equal(drips, 0);
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
