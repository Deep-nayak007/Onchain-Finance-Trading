import type { Address, Hex } from 'viem';
import { config } from './config';
import { requireBindings } from '../integration/team';
import { demoStore } from '../demo/store';
import { pnlFixture, traderFixtures } from '../demo/fixtures';
export const envio = {
  receipts: (account: Address) =>
    config.useMocks
      ? Promise.resolve([...demoStore.receipts])
      : requireBindings().readReceipts(account),
  receipt: (account: Address, hash: Hex) =>
    config.useMocks
      ? Promise.resolve(demoStore.receipts.find((r) => r.reasonHash === hash) ?? null)
      : requireBindings().readReceipt(account, hash),
  pnl: (account: Address) =>
    config.useMocks ? Promise.resolve(pnlFixture) : requireBindings().readPnl(account),
  traderStats: () =>
    config.useMocks ? Promise.resolve(traderFixtures) : requireBindings().readTraderStats(),
  policy: (account: Address) =>
    config.useMocks ? Promise.resolve(demoStore.policy) : requireBindings().readPolicy(account),
  balance: (account: Address) =>
    config.useMocks
      ? Promise.resolve(demoStore.cashUsd)
      : requireBindings().readBalanceUsd(account),
};
