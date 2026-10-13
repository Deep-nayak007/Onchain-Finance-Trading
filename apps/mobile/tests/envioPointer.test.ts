import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Envio caches the pointer for 60 seconds, follows rotation and retains the last valid URL', async (t) => {
  process.env.EXPO_PUBLIC_CHAIN_ID = '10143';
  process.env.EXPO_PUBLIC_ENVIO_URL_POINTER = 'https://pointer.test/current.txt';
  process.env.EXPO_PUBLIC_ENVIO_URL = 'https://fallback.test/v1/graphql';
  const { envioEndpoint } = await import('../lib/envioTransport');
  let now = 100000,
    calls = 0;
  let value: string | Error | null = null;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://pointer.test/current.txt');
    assert.equal(init.cache, 'no-store');
    calls++;
    if (value instanceof Error) throw value;
    return new Response(value ?? '', { status: value === null ? 404 : 200 });
  });
  assert.equal(await envioEndpoint(), 'https://fallback.test/v1/graphql');
  value = 'https://first.test/v1/graphql\n';
  assert.equal(await envioEndpoint(), 'https://first.test/v1/graphql');
  now += 59999;
  value = 'https://second.test/v1/graphql';
  assert.equal(await envioEndpoint(), 'https://first.test/v1/graphql');
  assert.equal(calls, 2);
  now += 2;
  assert.equal(await envioEndpoint(), 'https://second.test/v1/graphql');
  now += 60001;
  value = new TypeError('pointer unavailable');
  assert.equal(await envioEndpoint(), 'https://second.test/v1/graphql');
  value = 'http://untrusted.test/v1/graphql';
  assert.equal(await envioEndpoint(), 'https://second.test/v1/graphql');
  assert.equal(calls, 5);
});
