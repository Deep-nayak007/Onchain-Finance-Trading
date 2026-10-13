import type { Address } from 'viem';
import { api } from './api';
import { config } from './config';
import { publicClient } from './chain';
import { ServiceError } from './http';
import { requireConfiguredChain } from './config';
export async function coverGas(account: Address): Promise<void> {
  if (config.useMocks) {
    await api.drip(account);
    return;
  }
  requireConfiguredChain(await publicClient.getChainId());
  // A wallet that already has gas does not depend on the tank still being funded.
  if ((await publicClient.getBalance({ address: account })) > 0n) return;
  try {
    await api.drip(account);
  } catch (error) {
    if (!(error instanceof ServiceError) || error.status !== 409) throw error;
    if ((await publicClient.getBalance({ address: account })) > 0n) return;
    throw new Error(
      'This wallet already received its one-time gas top-up and has no MON left. Add test MON before signing.',
    );
  }
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if ((await publicClient.getBalance({ address: account })) > 0n) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    'The gas top-up has not arrived after 30 seconds. Check the funding service and try again.',
  );
}
