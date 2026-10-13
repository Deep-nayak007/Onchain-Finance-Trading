import { z } from 'zod';
import type { ZodType } from 'zod';
import { PERPL_TESTNET } from '@leash/shared/addresses';
import { config } from './config';
import { request } from './http';
import { addressSchema, riskSchema, txRequestSchema } from './schemas';
import { demoStore } from '../mocks/store';
import { bookFixture } from '../mocks/fixtures';
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
const level = z.object({ price: decimal, size: decimal });
export const bookSchema = z
  .object({ bids: z.array(level), asks: z.array(level), ts: z.number().int().nonnegative() })
  .transform((book) => ({
    bids: book.bids.map((p): [string, string] => [p.price, p.size]),
    asks: book.asks.map((p): [string, string] => [p.price, p.size]),
    ts: new Date(book.ts * 1000).toISOString(),
  }));
export const spotBookSchema = z.object({
  bids: z.array(z.tuple([decimal, decimal])),
  asks: z.array(z.tuple([decimal, decimal])),
  ts: z.iso.datetime({ offset: true }),
});
export const keyPrepareSchema = z
  .object({
    keyAddress: addressSchema,
    tradeKey: addressSchema,
    enrollment: txRequestSchema.nullable(),
  })
  .refine((value) => value.keyAddress.toLowerCase() === value.tradeKey.toLowerCase(), {
    message: 'The gateway returned conflicting key addresses.',
  });
export const gatewayHealthSchema = z.object({
  ok: z.boolean(),
  block: z.number().int().nonnegative(),
  cacheLagBlocks: z.number().int().nonnegative(),
});
export const marketsSchema = z.array(
  z.object({
    market: z.string(),
    perpId: z.number().int().nonnegative(),
    mark: decimal,
    index: decimal,
    fundingRate: z.string().regex(/^-?\d+(?:\.\d+)?$/),
    tickSize: decimal,
    lotSize: decimal,
  }),
);
export function assertGatewayMarkets(markets: z.infer<typeof marketsSchema>, chainId: 143 | 10143) {
  const mon = markets.find((market) => market.market === 'MON-PERP');
  if (!mon) throw new Error('The gateway has not loaded MON-PERP yet. Try again shortly.');
  const testnetId = PERPL_TESTNET.perpIds['MON-PERP'];
  if ((chainId === 10143) !== (mon.perpId === testnetId))
    throw new Error(
      'The Perpl gateway is serving another network. Check its URL before continuing.',
    );
}
let checkedAt = 0;
let checking: Promise<void> | null = null;
async function checkGateway(force: boolean) {
  if (!force && Date.now() - checkedAt < 30000) return;
  if (checking) return checking;
  checking = (async () => {
    const [health, markets] = await Promise.all([
      request(config.gatewayUrl, '/health', gatewayHealthSchema),
      request(config.gatewayUrl, '/markets', marketsSchema),
    ]);
    if (!health.ok || health.block === 0)
      throw new Error(
        'The trading service is warming up or its market data is stale. Try again shortly.',
      );
    assertGatewayMarkets(markets, config.chainId);
    checkedAt = Date.now();
  })();
  try {
    await checking;
  } finally {
    checking = null;
  }
}
export async function requestGateway<T>(
  path: string,
  schema: ZodType<T>,
  body?: unknown,
): Promise<T> {
  await checkGateway(body !== undefined);
  return request(config.gatewayUrl, path, schema, body);
}
export const gateway = {
  health: () => request(config.gatewayUrl, '/health', gatewayHealthSchema),
  markets: () => request(config.gatewayUrl, '/markets', marketsSchema),
  risk: (account: string) =>
    config.useMocks
      ? Promise.resolve({ ...demoStore.risk, ts: Math.floor(Date.now() / 1000) })
      : requestGateway(`/risk/${encodeURIComponent(account)}`, riskSchema),
  book: (market: string) =>
    config.useMocks
      ? Promise.resolve(bookFixture)
      : requestGateway(`/book/${encodeURIComponent(market)}?depth=20`, bookSchema),
};
