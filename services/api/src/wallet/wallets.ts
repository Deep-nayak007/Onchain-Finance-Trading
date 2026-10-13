// One Privy server wallet per user×trader (policy-locked) and one per persona (logShadow only).
import type { PersonaId } from "@leash/shared";
import type { Account, Address } from "viem";
import type { Store, WalletRow } from "../store/db";
import { denyAllPolicy, personaWalletPolicy, userWalletPolicy } from "./policies";
import { privyAccount, type PrivyClient } from "./privy";

export type WalletEnv = {
  chainId: number;
  receiptLog: Address | null;
  kuruMarkets: Address[];
  tokens: Address[];
};

export class Wallets {
  constructor(
    private readonly store: Store,
    private readonly privy: PrivyClient | null,
    private readonly env: WalletEnv,
  ) {}

  get configured(): boolean {
    return !!this.privy && !!this.env.receiptLog;
  }

  private need(): { privy: PrivyClient; receiptLog: Address } {
    if (!this.privy) throw new Error("Privy not configured (PRIVY_APP_ID / PRIVY_APP_SECRET)");
    if (!this.env.receiptLog) throw new Error(`ReceiptLog not deployed on chain ${this.env.chainId}`);
    return { privy: this.privy, receiptLog: this.env.receiptLog };
  }

  static userKey = (user: string, persona: PersonaId) => `${user.toLowerCase()}:${persona}`;
  static personaKey = (persona: PersonaId) => `persona:${persona}`;

  /** Get-or-create the user×trader wallet with its locked policy. Idempotent. */
  async userWallet(user: Address, persona: PersonaId): Promise<WalletRow> {
    const key = Wallets.userKey(user, persona);
    const existing = this.store.getWallet(key);
    if (existing) return existing;
    const { privy, receiptLog } = this.need();
    const policy = await privy.createPolicy(
      userWalletPolicy({ chainId: this.env.chainId, user, persona, receiptLog, kuruMarkets: this.env.kuruMarkets, tokens: this.env.tokens }),
    );
    const w = await privy.createWallet([policy.id]);
    const row: WalletRow = { key, walletId: w.id, address: w.address as Address, policyId: policy.id };
    this.store.saveWallet(row);
    return row;
  }

  async personaWallet(persona: PersonaId): Promise<WalletRow> {
    const key = Wallets.personaKey(persona);
    const existing = this.store.getWallet(key);
    if (existing) return existing;
    const { privy, receiptLog } = this.need();
    const policy = await privy.createPolicy(personaWalletPolicy({ chainId: this.env.chainId, persona, receiptLog }));
    const w = await privy.createWallet([policy.id]);
    const row: WalletRow = { key, walletId: w.id, address: w.address as Address, policyId: policy.id };
    this.store.saveWallet(row);
    return row;
  }

  /**
   * Re-links a user's agent wallet after the local store was wiped (free hosting = ephemeral disk): the onchain
   * mandate names the wallet address; Privy still holds it. Returns null when Privy has no such wallet.
   */
  async adopt(user: Address, persona: PersonaId, address: Address): Promise<WalletRow | null> {
    const key = Wallets.userKey(user, persona);
    const existing = this.store.getWallet(key);
    if (existing) return existing;
    const { privy } = this.need();
    const w = await privy.findWalletByAddress(address);
    if (!w) return null;
    const row: WalletRow = { key, walletId: w.id, address: w.address as Address, policyId: w.policy_ids?.[0] ?? "" };
    this.store.saveWallet(row);
    return row;
  }

  /** Kill switch: replace the wallet's policy with deny-all. */
  async denyAll(user: Address, persona: PersonaId): Promise<boolean> {
    const row = this.store.getWallet(Wallets.userKey(user, persona));
    if (!row || !this.privy) return false;
    const deny = await this.privy.createPolicy(denyAllPolicy(row.key));
    await this.privy.setWalletPolicy(row.walletId, deny.id);
    this.store.saveWallet({ ...row, policyId: deny.id });
    return true;
  }

  /** After a kill, a fresh signed mandate re-enables the wallet with its normal locked policy. */
  async restore(user: Address, persona: PersonaId): Promise<WalletRow> {
    const row = await this.userWallet(user, persona);
    const { privy, receiptLog } = this.need();
    const policy = await privy.createPolicy(
      userWalletPolicy({ chainId: this.env.chainId, user, persona, receiptLog, kuruMarkets: this.env.kuruMarkets, tokens: this.env.tokens }),
    );
    await privy.setWalletPolicy(row.walletId, policy.id);
    const next = { ...row, policyId: policy.id };
    this.store.saveWallet(next);
    return next;
  }

  account(row: WalletRow): Account {
    if (!this.privy) throw new Error("Privy not configured");
    return privyAccount(this.privy, row.walletId, row.address);
  }
}
