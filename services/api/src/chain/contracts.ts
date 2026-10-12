// Contract reads + receipt calldata. Addresses/ABIs come only from @leash/shared (Rails-owned).
import {
  LEASH,
  fromUsd6,
  leverageFromX10,
  mandateRegistryAbi,
  receiptLogAbi,
  sideToInt8,
  toPrice1e18,
  toUsd6,
  type ChainId,
  type Intent,
  type SlackGrant,
} from "@leash/shared";
import { createPublicClient, encodeFunctionData, http, keccak256, toBytes, type Address, type Hex, type PublicClient } from "viem";
import { monadChain } from "@leash/shared";

export type LeashAddresses = { mandateRegistry: Address; receiptLog: Address; referee: Address | null };

/** Null when Rails hasn't deployed to this chain yet (mainnet today). */
export function leashAddresses(chainId: ChainId): LeashAddresses | null {
  const d = chainId === 143 ? LEASH.mainnet : LEASH.testnet;
  if (!d.mandateRegistry.address || !d.receiptLog.address) return null;
  return { mandateRegistry: d.mandateRegistry.address as Address, receiptLog: d.receiptLog.address as Address, referee: d.referee as Address | null };
}

export function makePublicClient(chainId: ChainId, url: string | undefined): PublicClient {
  return createPublicClient({ chain: monadChain(chainId), transport: http(url) }) as PublicClient;
}

export type MandateView = {
  policyHash: Hex;
  maxNotionalUsd: string;
  maxLeverage: number;
  maxWeeklyLossPct: number;
  agentId: bigint;
  agentWallet: Address;
  perplKey: Address;
  paused: boolean;
  updatedAt: number;
};

export interface Registry {
  getMandate(user: Address): Promise<MandateView | null>;
  activeSlack(user: Address): Promise<SlackGrant | null>;
  isActive(user: Address): Promise<boolean>;
}

export class OnchainRegistry implements Registry {
  constructor(
    private readonly client: PublicClient,
    private readonly address: Address,
  ) {}

  async getMandate(user: Address): Promise<MandateView | null> {
    const m = await this.client.readContract({ address: this.address, abi: mandateRegistryAbi, functionName: "getMandate", args: [user] });
    if (BigInt(m.updatedAt) === 0n) return null;
    return {
      policyHash: m.policyHash,
      maxNotionalUsd: fromUsd6(BigInt(m.maxNotionalUsd6)),
      maxLeverage: leverageFromX10(Number(m.maxLeverageX10)),
      maxWeeklyLossPct: Number(m.maxWeeklyLossBps) / 100,
      agentId: BigInt(m.agentId),
      agentWallet: m.agentWallet,
      perplKey: m.perplKey,
      paused: m.paused,
      updatedAt: Number(m.updatedAt),
    };
  }

  async activeSlack(user: Address): Promise<SlackGrant | null> {
    const [s, active] = await this.client.readContract({ address: this.address, abi: mandateRegistryAbi, functionName: "activeSlack", args: [user] });
    if (!active) return null;
    return {
      active,
      maxLeverage: leverageFromX10(Number(s.maxLeverageX10)),
      maxNotionalUsd: fromUsd6(BigInt(s.maxNotionalUsd6)),
      extraRiskUsd: fromUsd6(BigInt(s.extraRiskUsd6)),
      expiresAt: Number(s.expiresAt),
    };
  }

  isActive(user: Address): Promise<boolean> {
    return this.client.readContract({ address: this.address, abi: mandateRegistryAbi, functionName: "isActive", args: [user] });
  }
}

export const VENUE = { PERPL: 0, KURU: 1 } as const;
export const STATUS = { EXECUTED: 0, REJECTED: 1, FAILED: 2, SHADOW: 3 } as const;
export type ReceiptStatus = keyof typeof STATUS;

export const ZERO32 = `0x${"0".repeat(64)}` as Hex;

/** bytes32 market id = keccak256(market) (§6). */
export const marketId = (market: string): Hex => keccak256(toBytes(market));

export type ReceiptFields = {
  user: Address;
  intent: Pick<Intent, "venue" | "market" | "side" | "sizeUsd">;
  price: string;
  status: ReceiptStatus;
  usedSlack: boolean;
  reasonHash: Hex;
  signalHash: Hex;
  execTxHash: Hex | null;
};

function receiptInput(r: ReceiptFields) {
  return {
    user: r.user,
    venue: VENUE[r.intent.venue],
    market: marketId(r.intent.market),
    side: sideToInt8(r.intent.side),
    sizeUsd6: toUsd6(r.intent.sizeUsd),
    price1e18: toPrice1e18(r.price),
    status: STATUS[r.status],
    usedSlack: r.usedSlack,
    reasonHash: r.reasonHash,
    signalHash: r.signalHash,
    execTxHash: r.execTxHash ?? ZERO32,
  } as const;
}

export function logReceiptData(r: ReceiptFields): Hex {
  if (r.status === "SHADOW") throw new Error("SHADOW receipts go through logShadow");
  return encodeFunctionData({ abi: receiptLogAbi, functionName: "logReceipt", args: [receiptInput(r)] });
}

export function logShadowData(agentId: bigint, r: Omit<ReceiptFields, "status">): Hex {
  return encodeFunctionData({ abi: receiptLogAbi, functionName: "logShadow", args: [agentId, receiptInput({ ...r, status: "SHADOW" })] });
}

export function pauseData(user: Address, reason: string): Hex {
  return encodeFunctionData({ abi: mandateRegistryAbi, functionName: "pause", args: [user, reason] });
}
