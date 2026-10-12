import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi, zeroAddress, type Address } from "viem";
import { buildSwapLegs, KURU_ORDERBOOK_ABI, type Params } from "../src/exec/kuru";
import { denyAllPolicy, evaluate, personaWalletPolicy, userWalletPolicy } from "../src/wallet/policies";
import { PrivyClient } from "../src/wallet/privy";
import { USER } from "./helpers";

const RECEIPT_LOG = "0x21b168148e7c47ca0f1fab8bf9f69faff3aed6b3" as Address;
const MARKET = "0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9" as Address;
const USDC = "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570" as Address;
const STRANGER = "0x000000000000000000000000000000000000bEEF";

const policy = userWalletPolicy({ chainId: 10143, user: USER, persona: "falcon", receiptLog: RECEIPT_LOG, kuruMarkets: [MARKET], tokens: [USDC] });

describe("Privy policy: user×trader wallet (default deny)", () => {
  it("allows logReceipt on ReceiptLog", () => {
    expect(evaluate(policy, { chainId: 10143, to: RECEIPT_LOG, value: 0n, functionName: "logReceipt" })).toBe("ALLOW");
  });
  it("allows ERC-20 transfer back to the user", () => {
    expect(evaluate(policy, { chainId: 10143, to: USDC, value: 0n, functionName: "transfer", args: { to: USER } })).toBe("ALLOW");
  });
  it("REJECTS an ERC-20 transfer to anyone else (the CANNOT_WITHDRAW knot)", () => {
    expect(evaluate(policy, { chainId: 10143, to: USDC, value: 0n, functionName: "transfer", args: { to: STRANGER } })).toBe("DENY");
  });
  it("REJECTS a call to an unknown contract, logShadow, wrong chain, or native value to ReceiptLog", () => {
    expect(evaluate(policy, { chainId: 10143, to: STRANGER, value: 0n })).toBe("DENY");
    expect(evaluate(policy, { chainId: 10143, to: RECEIPT_LOG, value: 0n, functionName: "logShadow" })).toBe("DENY");
    expect(evaluate(policy, { chainId: 143, to: RECEIPT_LOG, value: 0n, functionName: "logReceipt" })).toBe("DENY");
    expect(evaluate(policy, { chainId: 10143, to: RECEIPT_LOG, value: 1n, functionName: "logReceipt" })).toBe("DENY");
  });
  it("allows Kuru market orders (value capped) and approve only to the market", () => {
    expect(evaluate(policy, { chainId: 10143, to: MARKET, value: 10n ** 18n })).toBe("ALLOW");
    expect(evaluate(policy, { chainId: 10143, to: MARKET, value: 51n * 10n ** 18n })).toBe("DENY");
    expect(evaluate(policy, { chainId: 10143, to: USDC, value: 0n, functionName: "approve", args: { spender: MARKET } })).toBe("ALLOW");
    expect(evaluate(policy, { chainId: 10143, to: USDC, value: 0n, functionName: "approve", args: { spender: STRANGER } })).toBe("DENY");
  });
  it("deny-all (kill) refuses even an otherwise-allowed call", () => {
    expect(evaluate(denyAllPolicy("x"), { chainId: 10143, to: RECEIPT_LOG, value: 0n, functionName: "logReceipt" })).toBe("DENY");
  });
  it("persona wallet: only logShadow", () => {
    const p = personaWalletPolicy({ chainId: 10143, persona: "otter", receiptLog: RECEIPT_LOG });
    expect(evaluate(p, { chainId: 10143, to: RECEIPT_LOG, value: 0n, functionName: "logShadow" })).toBe("ALLOW");
    expect(evaluate(p, { chainId: 10143, to: RECEIPT_LOG, value: 0n, functionName: "logReceipt" })).toBe("DENY");
  });
  it("policy JSON uses Privy's documented shape", () => {
    expect(policy).toMatchObject({ version: "1.0", chain_type: "ethereum" });
    for (const r of policy.rules) for (const c of r.conditions) expect(["ethereum_transaction", "ethereum_calldata"]).toContain((c as { field_source: string }).field_source);
  });
});

describe("PrivyClient", () => {
  it("signs via eth_signTransaction with basic auth + privy-app-id, hex quantities", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: { signed_transaction: "0xf86c" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const privy = new PrivyClient("app", "secret", fake);
    const signed = await privy.signTransaction("w1", { to: RECEIPT_LOG, data: "0x1234", value: 0n, chainId: 10143, nonce: 3, gas: 110_000n, maxFeePerGas: 100n, maxPriorityFeePerGas: 1n });
    expect(signed).toBe("0xf86c");
    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.privy.io/v1/wallets/w1/rpc");
    const h = init.headers as Record<string, string>;
    expect(h.authorization).toBe(`Basic ${Buffer.from("app:secret").toString("base64")}`);
    expect(h["privy-app-id"]).toBe("app");
    expect(JSON.parse(String(init.body))).toEqual({
      method: "eth_signTransaction",
      params: { transaction: { to: RECEIPT_LOG, data: "0x1234", value: "0x0", chain_id: 10143, nonce: 3, gas_limit: "0x1adb0", type: 2, max_fee_per_gas: "0x64", max_priority_fee_per_gas: "0x1" } },
    });
  });

  it("surfaces policy rejections as PrivyError", async () => {
    const fake = (async () => new Response('{"error":"Policy violation"}', { status: 400 })) as unknown as typeof fetch;
    await expect(new PrivyClient("a", "b", fake).signTransaction("w", { to: STRANGER as Address, chainId: 10143, nonce: 0, gas: 1n })).rejects.toThrow(/privy 400/);
  });
});

describe("Kuru swap legs (SDK OrderBook ABI, SDK unit rules)", () => {
  const p: Params = { pricePrecision: 10_000n, sizePrecision: 100_000_000_000n, baseAsset: zeroAddress, baseDecimals: 18, quoteAsset: USDC, quoteDecimals: 6 };

  it("BUY with ERC-20 quote: approve(market) then placeAndExecuteMarketBuy", () => {
    const legs = buildSwapLegs(MARKET, p, "BUY", 12.5, 4.9);
    expect(legs).toHaveLength(2);
    expect(decodeFunctionData({ abi: erc20Abi, data: legs[0]!.data })).toMatchObject({ functionName: "approve", args: [MARKET, 12_500_000n] });
    const buy = decodeFunctionData({ abi: KURU_ORDERBOOK_ABI, data: legs[1]!.data });
    expect(buy.functionName).toBe("placeAndExecuteMarketBuy");
    expect(buy.args).toEqual([125_000n, 4_900_000_000_000_000_000n, false, false]); // 12.5 @ 1e4 price precision; minOut in 18 dec
    expect(legs[1]!.value).toBe(0n);
  });

  it("SELL native MON: no approve, value = size in wei", () => {
    const legs = buildSwapLegs(MARKET, p, "SELL", 2, 4.8);
    expect(legs).toHaveLength(1);
    const sell = decodeFunctionData({ abi: KURU_ORDERBOOK_ABI, data: legs[0]!.data });
    expect(sell.functionName).toBe("placeAndExecuteMarketSell");
    expect(sell.args).toEqual([200_000_000_000n, 4_800_000n, false, false]);
    expect(legs[0]!.value).toBe(2n * 10n ** 18n);
  });
});
