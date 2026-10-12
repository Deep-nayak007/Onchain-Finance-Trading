import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { prepareTxRequest, resolveChainId, sendTx, sendTxAndWait, withGasBuffer } from "../src/sendTx";
import { TxRequest } from "../src/schemas";

const FROM = "0x00000000000000000000000000000000000000aa" as const;
const TO = "0x00000000000000000000000000000000000000bb" as const;
const HASH = `0x${"11".repeat(32)}` as const;

function mocks(opts: { estimate?: bigint; walletChainId?: number; status?: "success" | "reverted" } = {}) {
  const publicClient = {
    estimateGas: vi.fn().mockResolvedValue(opts.estimate ?? 100_000n),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: opts.status ?? "success" }),
  };
  const wallet = {
    account: { address: FROM, type: "local" },
    chain: opts.walletChainId === undefined ? undefined : { id: opts.walletChainId },
    sendTransaction: vi.fn().mockResolvedValue(HASH),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { publicClient: publicClient as unknown as PublicClient, wallet: wallet as any, raw: { publicClient, wallet } };
}

afterEach(() => vi.unstubAllEnvs());

describe("withGasBuffer", () => {
  it("adds 10% and rounds up", () => {
    expect(withGasBuffer(100_000n)).toBe(110_000n);
    expect(withGasBuffer(21_001n)).toBe(23_102n); // 23101.1 → 23102
    expect(withGasBuffer(0n)).toBe(0n);
  });
});

describe("resolveChainId", () => {
  it("reads CHAIN_ID from env", () => {
    vi.stubEnv("CHAIN_ID", "10143");
    expect(resolveChainId()).toBe(10143);
  });
  it("explicit value wins over env", () => {
    vi.stubEnv("CHAIN_ID", "10143");
    expect(resolveChainId(143)).toBe(143);
  });
  it("throws when missing or not Monad", () => {
    vi.stubEnv("CHAIN_ID", "");
    expect(() => resolveChainId()).toThrow(/CHAIN_ID is not set/);
    expect(() => resolveChainId(1)).toThrow(/Unsupported CHAIN_ID/);
  });
});

describe("sendTx", () => {
  it("estimates, adds 10%, sends explicit gas on the env chain", async () => {
    vi.stubEnv("CHAIN_ID", "10143");
    const { publicClient, wallet, raw } = mocks({ estimate: 50_000n });
    const res = await sendTx(wallet, publicClient, { to: TO, data: "0x1234", value: 5n });

    expect(raw.publicClient.estimateGas).toHaveBeenCalledWith({ account: FROM, to: TO, data: "0x1234", value: 5n });
    const sent = raw.wallet.sendTransaction.mock.calls[0]![0];
    expect(sent.gas).toBe(55_000n);
    expect(sent.chain.id).toBe(10143);
    expect(sent.to).toBe(TO);
    expect(res).toEqual({ hash: HASH, gas: 55_000n, chainId: 10143 });
  });

  it("uses an explicit gas limit without estimating", async () => {
    const { publicClient, wallet, raw } = mocks();
    const res = await sendTx(wallet, publicClient, { to: TO, value: 1n, gas: 21_000n }, { chainId: 143 });
    expect(raw.publicClient.estimateGas).not.toHaveBeenCalled();
    expect(raw.wallet.sendTransaction.mock.calls[0]![0].gas).toBe(21_000n);
    expect(res.chainId).toBe(143);
  });

  it("refuses when the wallet client is on another chain", async () => {
    const { publicClient, wallet, raw } = mocks({ walletChainId: 143 });
    await expect(sendTx(wallet, publicClient, { to: TO }, { chainId: 10143 })).rejects.toThrow(/chain 143/);
    expect(raw.wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("sendTxAndWait throws on revert", async () => {
    const { publicClient, wallet } = mocks({ status: "reverted" });
    await expect(sendTxAndWait(wallet, publicClient, { to: TO }, { chainId: 10143 })).rejects.toThrow(/reverted/);
  });

  it("sendTxAndWait returns the receipt on success", async () => {
    const { publicClient, wallet } = mocks();
    const res = await sendTxAndWait(wallet, publicClient, { to: TO }, { chainId: 10143 });
    expect(res.receipt.status).toBe("success");
  });
});

describe("prepareTxRequest", () => {
  it("returns a valid TxRequest with buffered gas", async () => {
    const { publicClient } = mocks({ estimate: 1_000n });
    const tx = await prepareTxRequest(publicClient, FROM, { to: TO, data: "0xabcd" }, { chainId: 10143 });
    expect(tx).toEqual({ to: TO, data: "0xabcd", value: "0", gas: "1100", chainId: 10143 });
    expect(TxRequest.parse(tx)).toEqual(tx);
  });
});
