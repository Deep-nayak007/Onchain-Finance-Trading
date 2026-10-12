// Gas drip: one small MON transfer per address from the gas tank (no 7702 on user wallets, §5.2).
import { sendTx } from "@leash/shared";
import { parseEther, type Account, type Address, type Chain, type PublicClient, type Transport, type WalletClient } from "viem";
import type { Store } from "../store/db";

export class DripError extends Error {
  constructor(
    readonly status: 409 | 429 | 503,
    message: string,
  ) {
    super(message);
  }
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
  if (!d.store.claimDrip(address)) throw new DripError(409, "already dripped to this address");
  try {
    const { hash } = await sendTx(d.wallet, d.publicClient, { to: address, value: parseEther(d.amountMon), gas: 21_000n }, { chainId: d.chainId });
    d.store.setDripTx(address, hash);
    return { txHash: hash, amountMon: d.amountMon };
  } catch (e) {
    d.store.setDripTx(address, null); // release the claim so the user can retry
    throw e;
  }
}
