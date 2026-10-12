import { z } from 'zod';
import { config } from './config';
import { request } from './http';
import { riskSchema } from './schemas';
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
export const gateway = {
  risk: (account: string) =>
    config.useMocks
      ? Promise.resolve({ ...demoStore.risk, ts: Math.floor(Date.now() / 1000) })
      : request(config.gatewayUrl, `/risk/${encodeURIComponent(account)}`, riskSchema),
  book: (market: string) =>
    config.useMocks
      ? Promise.resolve(bookFixture)
      : request(config.gatewayUrl, `/book/${encodeURIComponent(market)}?depth=20`, bookSchema),
};
