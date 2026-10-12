// Every transaction goes through here (ARCHITECTURE.md §5.1): Monad charges gas on the declared
// gas LIMIT, so we estimate, add 10%, and always send an explicit `gas`. No mempool: confirm by
// receipt only (sendTxAndWait). Chain comes from CHAIN_ID (143 mainnet, 10143 testnet).
import type { Account, Address, Chain, Hex, PublicClient, TransactionReceipt, Transport, WalletClient } from "viem";
import { monad, monadTestnet } from "viem/chains";
import { ChainId, type TxRequest } from "./schemas";

export const GAS_BUFFER_BPS = 1_000n; // +10%

export const MONAD_CHAINS = { 143: monad, 10143: monadTestnet } as const satisfies Record<ChainId, Chain>;

export type TxInput = {
  to: Address;
  data?: Hex;
  value?: bigint;
  /** Explicit gas limit (e.g. 21000 for a plain transfer). Skips estimation. */
  gas?: bigint;
};

export type SendTxOptions = {
  /** Overrides CHAIN_ID from the environment. */
  chainId?: number;
};

/** Ceil(estimate * (1 + bps/10000)). */
export function withGasBuffer(estimate: bigint, bps: bigint = GAS_BUFFER_BPS): bigint {
  return (estimate * (10_000n + bps) + 9_999n) / 10_000n;
}

/** Validates a chain id: only Monad mainnet (143) and testnet (10143) are allowed. */
export function resolveChainId(raw?: number | string): ChainId {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const fromEnv = env?.CHAIN_ID;
  const value = raw ?? fromEnv;
  if (value === undefined || value === "") throw new Error("CHAIN_ID is not set (expected 143 or 10143)");
  const parsed = ChainId.safeParse(Number(value));
  if (!parsed.success) throw new Error(`Unsupported CHAIN_ID ${String(value)} (expected 143 or 10143)`);
  return parsed.data;
}

export function monadChain(chainId?: number | string): Chain {
  return MONAD_CHAINS[resolveChainId(chainId)];
}

/** Gas limit to send: the explicit one, or estimate + 10%. */
export async function gasLimitFor(publicClient: PublicClient, from: Address, req: TxInput): Promise<bigint> {
  if (req.gas !== undefined) return req.gas;
  const estimate = await publicClient.estimateGas({ account: from, to: req.to, data: req.data, value: req.value });
  return withGasBuffer(estimate);
}

/** Signs and broadcasts with an explicit gas limit. Returns the tx hash (not yet confirmed). */
export async function sendTx(
  wallet: WalletClient<Transport, Chain | undefined, Account>,
  publicClient: PublicClient,
  req: TxInput,
  opts: SendTxOptions = {},
): Promise<{ hash: Hex; gas: bigint; chainId: ChainId }> {
  const chain = monadChain(opts.chainId);
  const chainId = chain.id as ChainId;
  if (wallet.chain && wallet.chain.id !== chainId) {
    throw new Error(`Wallet client is on chain ${wallet.chain.id}, CHAIN_ID is ${chainId}`);
  }
  const gas = await gasLimitFor(publicClient, wallet.account.address, req);
  const hash = await wallet.sendTransaction({
    account: wallet.account,
    chain,
    to: req.to,
    data: req.data,
    value: req.value,
    gas,
  });
  return { hash, gas, chainId };
}

/** sendTx + wait for the receipt. Throws if the tx reverted. */
export async function sendTxAndWait(
  wallet: WalletClient<Transport, Chain | undefined, Account>,
  publicClient: PublicClient,
  req: TxInput,
  opts: SendTxOptions = {},
): Promise<{ hash: Hex; gas: bigint; chainId: ChainId; receipt: TransactionReceipt }> {
  const sent = await sendTx(wallet, publicClient, req, opts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: sent.hash });
  if (receipt.status !== "success") throw new Error(`Transaction ${sent.hash} reverted`);
  return { ...sent, receipt };
}

/** Unsigned TxRequest (§7.2) for the user to sign in the app, with gas already buffered. */
export async function prepareTxRequest(
  publicClient: PublicClient,
  from: Address,
  req: TxInput,
  opts: SendTxOptions = {},
): Promise<TxRequest> {
  const chainId = resolveChainId(opts.chainId);
  const gas = await gasLimitFor(publicClient, from, req);
  return {
    to: req.to,
    data: req.data ?? "0x",
    value: (req.value ?? 0n).toString(),
    gas: gas.toString(),
    chainId,
  };
}
