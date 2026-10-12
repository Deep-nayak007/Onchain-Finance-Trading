import type { Address } from 'viem';
import { api } from './api';
import { config } from './config';
import { publicClient } from './chain';
export async function coverGas(account: Address): Promise<void> {
  await api.drip(account);
  if (config.useMocks) return;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if ((await publicClient.getBalance({ address: account })) > 0n) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    'The gas top-up has not arrived after 30 seconds. Check the funding service and try again.',
  );
}
