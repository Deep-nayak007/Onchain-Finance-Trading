import type { Address } from 'viem';
import { api } from './api';
import { config } from './config';
import { publicClient } from './chain';
import { ServiceConnectionError, ServiceError } from './http';
import { requireConfiguredChain } from './config';
const rpcError = (cause: unknown) =>
  new Error(
    `Could not read your wallet on ${config.networkName}. Check your connection and retry. In Brave, check whether Shields blocked the RPC request.`,
    { cause },
  );
async function gasBalance(account: Address) {
  try {
    return await publicClient.getBalance({ address: account });
  } catch (error) {
    throw rpcError(error);
  }
}
export async function coverGas(account: Address): Promise<void> {
  if (config.useMocks) {
    await api.drip(account);
    return;
  }
  let chainId: number;
  try {
    chainId = await publicClient.getChainId();
  } catch (error) {
    throw rpcError(error);
  }
  requireConfiguredChain(chainId);
  // A wallet that already has gas does not depend on the tank still being funded.
  if ((await gasBalance(account)) > 0n) return;
  try {
    await api.drip(account);
  } catch (error) {
    // The transfer can succeed even when the browser loses the HTTP response.
    // Check the actual wallet before asking the user to retry the funding step.
    if (error instanceof ServiceConnectionError) {
      if ((await gasBalance(account)) > 0n) return;
      throw error;
    }
    if (!(error instanceof ServiceError) || error.status !== 409) throw error;
    if ((await gasBalance(account)) > 0n) return;
    throw new Error(
      'This wallet already received its one-time gas top-up and has no MON left. Add test MON before signing.',
    );
  }
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if ((await gasBalance(account)) > 0n) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    'The gas top-up has not arrived after 30 seconds. Check the funding service and try again.',
  );
}
