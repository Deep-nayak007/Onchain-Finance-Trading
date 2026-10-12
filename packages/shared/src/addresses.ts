// TODO: owned by Yadnesh (Rails). Fill with real deployed addresses + source URL per entry.
// Never invent addresses: every value stays null until Rails commits a verified one.
import type { Address } from "viem";

export type DeployedAddresses = {
  mandateRegistry: Address | null;
  receiptLog: Address | null;
  referee: Address | null;
  perplExchange: Address | null;
  ausd: Address | null;
  kuruRouter: Address | null;
  kuruMonAusdMarket: Address | null;
  erc8004IdentityRegistry: Address | null;
};

const empty: DeployedAddresses = {
  mandateRegistry: null,
  receiptLog: null,
  referee: null,
  perplExchange: null,
  ausd: null,
  kuruRouter: null,
  kuruMonAusdMarket: null,
  erc8004IdentityRegistry: null,
};

export const ADDRESSES: Record<143 | 10143, DeployedAddresses> = {
  143: { ...empty },
  10143: { ...empty },
};
