// Privy server wallets over REST (docs.privy.io/api-reference). We use eth_signTransaction (chain-agnostic)
// and broadcast through our own RPC, so every tx still goes through sendTx (estimate +10%, explicit gas).
import { toAccount } from "viem/accounts";
import { toHex, type Account, type Address, type Hex, type TransactionSerializable } from "viem";
import { z } from "zod";

const API = "https://api.privy.io/v1";

export const PrivyWallet = z.object({ id: z.string(), address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), policy_ids: z.array(z.string()).optional() });
const PrivyPolicyRes = z.object({ id: z.string() });
const SignRes = z.object({ data: z.object({ signed_transaction: z.string() }) });

export class PrivyError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`privy ${status}: ${body.slice(0, 300)}`);
    this.name = "PrivyError";
  }
}

export type PolicyRule = {
  name: string;
  method: "eth_signTransaction" | "eth_sendTransaction" | "*";
  action: "ALLOW" | "DENY";
  conditions: Record<string, unknown>[];
};
export type PrivyPolicy = { version: "1.0"; name: string; chain_type: "ethereum"; rules: PolicyRule[] };

export class PrivyClient {
  private readonly auth: string;
  constructor(
    private readonly appId: string,
    appSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.auth = `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`;
  }

  private async req<S extends z.ZodType>(schema: S, method: string, path: string, body?: unknown): Promise<z.infer<S>> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: { authorization: this.auth, "privy-app-id": this.appId, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new PrivyError(res.status, text);
    return schema.parse(JSON.parse(text));
  }

  createWallet(policyIds: string[] = []) {
    return this.req(PrivyWallet, "POST", "/wallets", { chain_type: "ethereum", ...(policyIds.length ? { policy_ids: policyIds } : {}) });
  }

  /** Finds a server wallet by address (paginated list). Privy is the durable record; our sqlite is a cache. */
  async findWalletByAddress(address: string): Promise<z.infer<typeof PrivyWallet> | null> {
    const Page = z.object({ data: z.array(PrivyWallet), next_cursor: z.string().nullish() });
    let cursor: string | null | undefined;
    for (let i = 0; i < 100; i++) {
      const page = await this.req(Page, "GET", `/wallets?chain_type=ethereum&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      const hit = page.data.find((w) => w.address.toLowerCase() === address.toLowerCase());
      if (hit) return hit;
      cursor = page.next_cursor;
      if (!cursor) return null;
    }
    return null;
  }

  getWallet(id: string) {
    return this.req(PrivyWallet, "GET", `/wallets/${id}`);
  }

  /** Only one policy per wallet is supported by Privy today. */
  setWalletPolicy(walletId: string, policyId: string) {
    return this.req(PrivyWallet, "PATCH", `/wallets/${walletId}`, { policy_ids: [policyId] });
  }

  createPolicy(p: PrivyPolicy) {
    return this.req(PrivyPolicyRes, "POST", "/policies", p);
  }

  async signTransaction(walletId: string, tx: TransactionSerializable): Promise<Hex> {
    const t = tx as TransactionSerializable & { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint; gasPrice?: bigint };
    const transaction: Record<string, unknown> = {
      to: t.to,
      data: t.data ?? "0x",
      value: toHex(t.value ?? 0n),
      chain_id: t.chainId,
      nonce: t.nonce,
      gas_limit: t.gas === undefined ? undefined : toHex(t.gas),
    };
    if (t.maxFeePerGas !== undefined) {
      transaction.type = 2;
      transaction.max_fee_per_gas = toHex(t.maxFeePerGas);
      transaction.max_priority_fee_per_gas = toHex(t.maxPriorityFeePerGas ?? 0n);
    } else if (t.gasPrice !== undefined) {
      transaction.type = 0;
      transaction.gas_price = toHex(t.gasPrice);
    }
    const r = await this.req(SignRes, "POST", `/wallets/${walletId}/rpc`, { method: "eth_signTransaction", params: { transaction } });
    return r.data.signed_transaction as Hex;
  }
}

/** viem Account backed by a Privy server wallet. Only transaction signing is supported. */
export function privyAccount(privy: PrivyClient, walletId: string, address: Address): Account {
  return toAccount({
    address,
    signTransaction: (tx) => privy.signTransaction(walletId, tx),
    signMessage: () => Promise.reject(new Error("privyAccount: signMessage not supported")),
    signTypedData: () => Promise.reject(new Error("privyAccount: signTypedData not supported")),
  });
}
