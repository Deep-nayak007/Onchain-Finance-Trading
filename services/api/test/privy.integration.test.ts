// Real Privy: proves the policy engine (not our code) refuses disallowed signatures.
// Runs only with PRIVY_INTEGRATION=1 and PRIVY_APP_ID/PRIVY_APP_SECRET in services/api/.env.
import "dotenv/config";
import { describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi, type Address } from "viem";
import { logReceiptData } from "../src/chain/contracts";
import { denyAllPolicy, userWalletPolicy } from "../src/wallet/policies";
import { PrivyClient, PrivyError } from "../src/wallet/privy";

const RUN = process.env.PRIVY_INTEGRATION === "1" && !!process.env.PRIVY_APP_ID && !!process.env.PRIVY_APP_SECRET;
const RECEIPT_LOG = "0x21b168148e7c47ca0f1fab8bf9f69faff3aed6b3" as Address;
const USDC = "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570" as Address;
const USER = "0x00000000000000000000000000000000000a11ce" as Address;
const STRANGER = "0x000000000000000000000000000000000000bEEF" as Address;

const base = { chainId: 10143, nonce: 0, gas: 200_000n, maxFeePerGas: 200_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n, value: 0n };

describe.skipIf(!RUN)("Privy policy engine (live)", () => {
  const privy = new PrivyClient(process.env.PRIVY_APP_ID!, process.env.PRIVY_APP_SECRET!);

  it("allows logReceipt + transfer-to-user, rejects transfer-to-stranger, and deny-all rejects everything", async () => {
    const policy = await privy.createPolicy(userWalletPolicy({ chainId: 10143, user: USER, persona: "falcon", receiptLog: RECEIPT_LOG, kuruMarkets: [], tokens: [USDC] }));
    const w = await privy.createWallet([policy.id]);

    const receipt = logReceiptData({
      user: USER,
      intent: { venue: "PERPL", market: "MON-PERP", side: "LONG", sizeUsd: "10" },
      price: "2.43",
      status: "REJECTED",
      usedSlack: false,
      reasonHash: `0x${"11".repeat(32)}`,
      signalHash: `0x${"22".repeat(32)}`,
      execTxHash: null,
    });
    await expect(privy.signTransaction(w.id, { ...base, to: RECEIPT_LOG, data: receipt })).resolves.toMatch(/^0x/);

    const toUser = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [USER, 1_000_000n] });
    await expect(privy.signTransaction(w.id, { ...base, to: USDC, data: toUser })).resolves.toMatch(/^0x/);

    const toStranger = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [STRANGER, 1_000_000n] });
    await expect(privy.signTransaction(w.id, { ...base, to: USDC, data: toStranger })).rejects.toBeInstanceOf(PrivyError);
    await expect(privy.signTransaction(w.id, { ...base, to: STRANGER, data: "0x" })).rejects.toBeInstanceOf(PrivyError);
    await expect(privy.signTransaction(w.id, { ...base, chainId: 143, to: RECEIPT_LOG, data: receipt })).rejects.toBeInstanceOf(PrivyError);

    // Kill switch: swap in deny-all; the previously allowed call is now refused.
    const deny = await privy.createPolicy(denyAllPolicy(w.id));
    await privy.setWalletPolicy(w.id, deny.id);
    await expect(privy.signTransaction(w.id, { ...base, to: RECEIPT_LOG, data: receipt })).rejects.toBeInstanceOf(PrivyError);
  }, 60_000);
});
