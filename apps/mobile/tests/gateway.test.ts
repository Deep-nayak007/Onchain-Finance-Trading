import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { SERVICES, PERPL_TESTNET } from '@leash/shared/addresses';
import {
  assertGatewayMarkets,
  keyPrepareSchema,
  requestGateway,
  spotBookSchema,
} from '../lib/gateway';
import { serviceUrls } from '../lib/serviceUrls';
import { config } from '../lib/config';

test('shared service selection keeps testnet history and gateways on their network', () => {
  assert.equal(serviceUrls(10143).gatewayUrl, SERVICES.gatewayUrl);
  assert.equal(serviceUrls(143).gatewayUrl, SERVICES.gatewayUrlMainnet);
  assert.equal(serviceUrls(143).envioUrl, '');
  assert.equal(serviceUrls(143).envioUrlPointer, '');
  assert.throws(
    () => serviceUrls(10143, { gatewayUrl: SERVICES.gatewayUrlMainnet! }),
    /another network/,
  );
  assert.throws(() => serviceUrls(143, { gatewayUrl: SERVICES.gatewayUrl! }), /another network/);
});
test('market IDs catch an incorrectly configured custom gateway before account reads or orders', () => {
  const testnetMarkets = [
    {
      market: 'MON-PERP',
      perpId: PERPL_TESTNET.perpIds['MON-PERP']!,
      mark: '0.02',
      index: '0.02',
      fundingRate: '0',
      tickSize: '0.00001',
      lotSize: '1',
    },
  ];
  assert.doesNotThrow(() => assertGatewayMarkets(testnetMarkets, 10143));
  assert.throws(() => assertGatewayMarkets(testnetMarkets, 143), /another network/);
  assert.throws(() => assertGatewayMarkets([], 10143), /not loaded/);
});
test('nullable key enrollment cannot masquerade as a prepared authorization', () => {
  const keyAddress = '0x1111111111111111111111111111111111111111';
  const result = keyPrepareSchema.parse({ keyAddress, tradeKey: keyAddress, enrollment: null });
  assert.equal(result.enrollment, null);
  assert.equal(
    keyPrepareSchema.safeParse({
      ...result,
      tradeKey: '0x2222222222222222222222222222222222222222',
    }).success,
    false,
  );
});
test('stale or warming gateway blocks the prepare POST', async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    const path = new URL(url).pathname;
    paths.push(path);
    return new Response(
      JSON.stringify(
        path === '/health'
          ? { ok: false, block: 0, cacheLagBlocks: 100 }
          : [
              {
                market: 'MON-PERP',
                perpId: config.chainId === 10143 ? 64 : 10,
                mark: '0.02',
                index: '0.02',
                fundingRate: '0',
                tickSize: '0.00001',
                lotSize: '1',
              },
            ],
      ),
    );
  });
  await assert.rejects(requestGateway('/orders/prepare', z.unknown(), {}), /warming up/);
  assert.equal(paths.includes('/orders/prepare'), false);
});
test('spot order book uses the Brain SDK tuple shape and rejects malformed timestamps', () => {
  const book = { bids: [], asks: [['1.1', '220']], ts: '2026-10-13T05:08:50.927Z' };
  assert.deepEqual(spotBookSchema.parse(book), book);
  assert.equal(spotBookSchema.safeParse({ ...book, ts: 'yesterday' }).success, false);
});
