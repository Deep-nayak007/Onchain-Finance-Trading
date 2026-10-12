import { z } from 'zod';
import { config } from './config';
import { request } from './http';
import { riskSchema } from './schemas';
import { demoStore } from '../demo/store';
import { bookFixture } from '../demo/fixtures';
const level = z.tuple([z.string().regex(/^\d+(?:\.\d+)?$/), z.string().regex(/^\d+(?:\.\d+)?$/)]);
export const bookSchema = z.object({ bids: z.array(level), asks: z.array(level), ts: z.string() });
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
