// Gas drip: one small MON transfer per address from the gas tank (no 7702 on user wallets, §5.2).
import { sendTxAndWait } from "@leash/shared";
import { formatEther, parseEther, type Account, type Address, type Chain, type PublicClient, type Transport, type WalletClient } from "viem";
import type { Store } from "../store/db";

export class DripError extends Error {
  constructor(
    readonly status: 409 | 429 | 503,
    message: string,
  ) {
    super(message);
  }
}

/** Keep 0.01 MON for the tank's own gas; never send more than a fifth of what's left; below 0.01 MON a drip is useless. */
export function dripValue(want: bigint, tank: bigint): bigint {
  const spare = tank - parseEther("0.01");
  const v = want < spare / 5n ? want : spare / 5n;
  return v >= parseEther("0.01") ? v : 0n;
}

export type DripDeps = {
  store: Store;
  wallet: WalletClient<Transport, Chain | undefined, Account> | null;
  publicClient: PublicClient;
  amountMon: string;
  chainId: number;
  /** Global cap per rolling hour. */
  maxPerHour?: number;
};

export async function drip(d: DripDeps, address: Address): Promise<{ txHash: `0x${string}`; amountMon: string }> {
  if (!d.wallet) throw new DripError(503, "gas tank not configured");
  if (d.store.dripsSince(Date.now() - 3_600_000) >= (d.maxPerHour ?? 30)) throw new DripError(429, "drip rate limit, try again later");
  // Size the drip to what the tank can afford: full amount while healthy, smaller when low, clear 503 when empty.
  const tank = await d.publicClient.getBalance({ address: d.wallet.account.address });
  const value = dripValue(parseEther(d.amountMon), tank);
  if (value === 0n) throw new DripError(503, "gas tank is empty; ask the team to refill it from the Monad testnet faucet");
  if (!d.store.claimDrip(address)) throw new DripError(409, "already dripped to this address");
  try {
    // Confirm by receipt (no mempool on Monad): a reverted drip must not be reported as sent.
    const { hash } = await sendTxAndWait(d.wallet, d.publicClient, { to: address, value, gas: 21_000n }, { chainId: d.chainId });
    d.store.setDripTx(address, hash);
    return { txHash: hash, amountMon: formatEther(value) };
  } catch (e) {
    d.store.setDripTx(address, null); // release the claim so the user can retry
    throw e;
  }
}
