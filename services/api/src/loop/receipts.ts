// Commits receipts onchain. Live/paper receipts: logReceipt from the user×trader Privy wallet.
// Shadow receipts: logShadow from the persona's Privy wallet. All txs via sendTx (explicit gas).
import { monadChain, sendTxAndWait, type PersonaId } from "@leash/shared";
import { createWalletClient, http, type Address, type Hex, type PublicClient } from "viem";
import { logReceiptData, logShadowData, type ReceiptFields } from "../chain/contracts";
import type { Wallets } from "../wallet/wallets";

export type Logged = { txHash: Hex; confirmedAtMs: number };

export interface ReceiptSink {
  readonly onchain: boolean;
  logReceipt(persona: PersonaId, f: ReceiptFields): Promise<Logged | null>;
  logShadow(persona: PersonaId, agentId: bigint, f: Omit<ReceiptFields, "status" | "user">): Promise<Logged | null>;
}

export class OnchainReceiptSink implements ReceiptSink {
  readonly onchain = true;
  constructor(
    private readonly wallets: Wallets,
    private readonly publicClient: PublicClient,
    private readonly receiptLog: Address,
    private readonly chainId: number,
    private readonly rpcUrl: string | undefined,
  ) {}

  private client(account: ReturnType<Wallets["account"]>) {
    return createWalletClient({ account, chain: monadChain(this.chainId), transport: http(this.rpcUrl) });
  }

  async logReceipt(persona: PersonaId, f: ReceiptFields): Promise<Logged> {
    const row = await this.wallets.userWallet(f.user, persona);
    const res = await sendTxAndWait(this.client(this.wallets.account(row)), this.publicClient, { to: this.receiptLog, data: logReceiptData(f) }, { chainId: this.chainId });
    return { txHash: res.hash, confirmedAtMs: Date.now() };
  }

  async logShadow(persona: PersonaId, agentId: bigint, f: Omit<ReceiptFields, "status" | "user">): Promise<Logged> {
    const row = await this.wallets.personaWallet(persona);
    const data = logShadowData(agentId, { ...f, user: row.address });
    const res = await sendTxAndWait(this.client(this.wallets.account(row)), this.publicClient, { to: this.receiptLog, data }, { chainId: this.chainId });
    return { txHash: res.hash, confirmedAtMs: Date.now() };
  }
}

/** Keeps receipts local only (no contracts/Privy on this chain yet). */
export class LocalReceiptSink implements ReceiptSink {
  readonly onchain = false;
  readonly logged: { kind: "receipt" | "shadow"; persona: PersonaId; fields: unknown }[] = [];
  async logReceipt(persona: PersonaId, f: ReceiptFields) {
    this.logged.push({ kind: "receipt", persona, fields: f });
    return null;
  }
  async logShadow(persona: PersonaId, _agentId: bigint, f: Omit<ReceiptFields, "status" | "user">) {
    this.logged.push({ kind: "shadow", persona, fields: f });
    return null;
  }
}
