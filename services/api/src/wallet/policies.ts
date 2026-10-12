// Privy policies (the Wallet knot). Default-deny: anything no rule ALLOWs is refused by Privy.
// - user×trader wallet: ReceiptLog.logReceipt, Kuru market orders, ERC-20 transfer ONLY back to that user; value 0; one chain.
// - persona wallet: ReceiptLog.logShadow only.
// - deny-all: used by /agent/kill.
import { receiptLogAbi } from "@leash/shared";
import type { Address } from "viem";
import type { PolicyRule, PrivyPolicy } from "./privy";

const METHOD = "eth_signTransaction" as const;

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const fnAbi = (name: string) => receiptLogAbi.filter((x) => x.type === "function" && x.name === name);

const tx = (field: string, operator: string, value: unknown) => ({ field_source: "ethereum_transaction", field, operator, value });
const call = (field: string, abi: readonly unknown[], operator: string, value: unknown) => ({ field_source: "ethereum_calldata", field, abi, operator, value });

/** Privy requires rule names < 50 chars. */
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`.toLowerCase();

const common = (chainId: number) => [tx("chain_id", "eq", String(chainId)), tx("value", "eq", "0x0")];

export type UserWalletPolicyInput = {
  chainId: number;
  user: Address;
  persona: string;
  receiptLog: Address;
  /** Kuru market (order book) contracts for this chain, if known. */
  kuruMarkets: Address[];
  /** Max native MON (wei) per Kuru order (selling native MON sends value). */
  maxKuruValueWei?: bigint;
  /** Tokens the sleeve may hold and send back to the user (e.g. AUSD/USDC). */
  tokens: Address[];
};

export function userWalletPolicy(i: UserWalletPolicyInput): PrivyPolicy {
  const lower = (a: string) => a.toLowerCase();
  const rules: PolicyRule[] = [
    {
      name: "Allow ReceiptLog.logReceipt",
      method: METHOD,
      action: "ALLOW",
      conditions: [...common(i.chainId), tx("to", "eq", lower(i.receiptLog)), call("function_name", fnAbi("logReceipt"), "eq", "logReceipt")],
    },
  ];
  const maxValue = `0x${(i.maxKuruValueWei ?? 50n * 10n ** 18n).toString(16)}`;
  for (const m of i.kuruMarkets) {
    rules.push({
      name: `Allow Kuru market ${short(m)}`,
      method: METHOD,
      action: "ALLOW",
      conditions: [tx("chain_id", "eq", String(i.chainId)), tx("to", "eq", lower(m)), tx("value", "lte", maxValue)],
    });
    for (const t of i.tokens) {
      rules.push({
        name: `Allow approve ${short(t)} to Kuru ${short(m)}`,
        method: METHOD,
        action: "ALLOW",
        conditions: [...common(i.chainId), tx("to", "eq", lower(t)), call("approve.spender", ERC20_APPROVE_ABI, "eq", lower(m))],
      });
    }
  }
  for (const t of i.tokens) {
    rules.push({
      name: `Allow ${short(t)} transfer to user only`,
      method: METHOD,
      action: "ALLOW",
      conditions: [...common(i.chainId), tx("to", "eq", lower(t)), call("transfer.to", ERC20_TRANSFER_ABI, "eq", lower(i.user))],
    });
  }
  return { version: "1.0", name: `leash ${i.persona} ${lower(i.user)}`.slice(0, 49), chain_type: "ethereum", rules };
}

export function personaWalletPolicy(i: { chainId: number; persona: string; receiptLog: Address }): PrivyPolicy {
  return {
    version: "1.0",
    name: `leash persona ${i.persona}`,
    chain_type: "ethereum",
    rules: [
      {
        name: "Allow ReceiptLog.logShadow",
        method: METHOD,
        action: "ALLOW",
        conditions: [...common(i.chainId), tx("to", "eq", i.receiptLog.toLowerCase()), call("function_name", fnAbi("logShadow"), "eq", "logShadow")],
      },
    ],
  };
}

/** No ALLOW rules + an explicit DENY: Privy refuses every signature. */
export function denyAllPolicy(label: string): PrivyPolicy {
  return {
    version: "1.0",
    name: `leash deny-all ${label}`.slice(0, 49),
    chain_type: "ethereum",
    rules: [{ name: "Deny every transaction", method: METHOD, action: "DENY", conditions: [tx("chain_id", "in", ["143", "10143"])] }],
  };
}

// ---- local evaluator (mirrors Privy semantics for unit tests: default deny, any DENY wins) ----

export type TxView = { chainId: number; to: string; value: bigint; functionName?: string; args?: Record<string, string> };

export function evaluate(policy: PrivyPolicy, t: TxView): "ALLOW" | "DENY" {
  let allowed = false;
  for (const r of policy.rules) {
    const match = r.conditions.every((c) => matches(c as Cond, t));
    if (!match) continue;
    if (r.action === "DENY") return "DENY";
    allowed = true;
  }
  return allowed ? "ALLOW" : "DENY";
}

type Cond = { field_source: string; field: string; operator: string; value: unknown };

function matches(c: Cond, t: TxView): boolean {
  let actual: string | undefined;
  if (c.field_source === "ethereum_transaction") {
    actual = c.field === "chain_id" ? String(t.chainId) : c.field === "to" ? t.to.toLowerCase() : c.field === "value" ? `0x${t.value.toString(16)}` : undefined;
  } else if (c.field_source === "ethereum_calldata") {
    if (c.field === "function_name") actual = t.functionName;
    else {
      const [fn, arg] = c.field.split(".");
      actual = fn === t.functionName && arg ? t.args?.[arg]?.toLowerCase() : undefined;
    }
  }
  if (actual === undefined) return false;
  if (c.operator === "eq") return actual.toLowerCase() === String(c.value).toLowerCase();
  if (c.operator === "lte") return BigInt(actual) <= BigInt(String(c.value));
  if (c.operator === "in") return (c.value as string[]).map((v) => v.toLowerCase()).includes(actual.toLowerCase());
  return false;
}
