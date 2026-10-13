import { z } from 'zod';
import { config } from './config';
import { request } from './http';
import { riskSchema } from './schemas';
import { demoStore } from '../mocks/store';
import { bookFixture } from '../mocks/fixtures';
const num = z.string().regex(/^\d+(?:\.\d+)?$/);
// Accepts the app's tuple shape and the gateway's {price,size} levels with a unix ts (gateway.openapi.yaml).
const level = z.union([z.tuple([num, num]), z.object({ price: num, size: num }).transform((l) => [l.price, l.size] as [string, string])]);
export const bookSchema = z.object({
  bids: z.array(level),
  asks: z.array(level),
  ts: z.union([z.string(), z.number()]).transform((v) => (typeof v === 'number' ? new Date(v * 1000).toISOString() : v)),
});
export const gateway = {
  risk: (account: string) =>
    config.useMocks
      ? Promise.resolve({ ...demoStore.risk, ts: new Date().toISOString() })
      : request(config.gatewayUrl, `/risk/${encodeURIComponent(account)}`, riskSchema),
  book: (market: string) =>
    config.useMocks
      ? Promise.resolve(bookFixture)
      : request(config.gatewayUrl, `/book/${encodeURIComponent(market)}?depth=20`, bookSchema),
};
