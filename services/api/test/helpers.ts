import type { SlackGrant } from "@leash/shared";
import type { Address, PublicClient } from "viem";
import type { MandateView, Registry } from "../src/chain/contracts";
import { MockGateway } from "../src/exec/gateway";
import type { ChatJson, JsonCall } from "../src/llm/client";
import { Engine, type EngineDeps } from "../src/loop/engine";
import { LocalReceiptSink } from "../src/loop/receipts";
import { MemoryPusher } from "../src/push/expo";
import { Envio } from "../src/signals/envio";
import type { Nansen, NansenSignal } from "../src/signals/nansen";
import { Store } from "../src/store/db";

export const USER = "0x00000000000000000000000000000000000a11ce" as Address;

/** Scripted chat: returns the queued replies in order; records calls. */
export class FakeChat implements ChatJson {
  readonly calls: (JsonCall & { history?: unknown[] })[] = [];
  constructor(private readonly replies: (string | Error)[]) {}
  async complete(call: JsonCall & { history?: { role: "assistant" | "user"; content: string }[] }) {
    this.calls.push(call);
    const r = this.replies.shift();
    if (r === undefined) throw new Error("no more scripted replies");
    if (r instanceof Error) throw r;
    return r;
  }
}

export class FakeNansen {
  constructor(public signal: NansenSignal | null) {}
  async get() {
    return this.signal;
  }
}

export const nansenSignal = (netflow24hUsd: number, fetchedAt = "2026-10-12T00:00:00.000Z"): NansenSignal => ({
  fetchedAt,
  token: "MON",
  netflow1hUsd: 0,
  netflow24hUsd,
  netflow7dUsd: 0,
  traderCount: 5,
});

export class FakeRegistry implements Registry {
  active = true;
  slack: SlackGrant | null = null;
  mandate: MandateView | null = null;
  async getMandate() {
    return this.mandate;
  }
  async activeSlack() {
    return this.slack;
  }
  async isActive() {
    return this.active;
  }
}

export function intentJson(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    action: "OPEN",
    venue: "PERPL",
    market: "MON-PERP",
    side: "LONG",
    sizeUsd: "20",
    leverage: 2,
    confidence: 0.8,
    rationale: "Smart money is buying and price is rising.",
    signals: [{ source: "nansen", key: "netflow24hUsd", value: "150000" }],
    ...over,
  });
}

export function makeEngine(over: Partial<EngineDeps> & { replies?: (string | Error)[]; nansen?: FakeNansen } = {}) {
  const store = over.store ?? new Store(":memory:");
  const sink = new LocalReceiptSink();
  const pusher = new MemoryPusher();
  const gateway = new MockGateway({ maxOrderUsd: 25 });
  const nansen = over.nansen ?? new FakeNansen(nansenSignal(150_000));
  let t = Date.parse("2026-10-12T12:00:00.000Z");
  const deps: EngineDeps = {
    live: false,
    modelTick: "qwen-flash-character",
    store,
    gateway,
    nansen: nansen as unknown as Nansen,
    envio: new Envio(undefined),
    chat: new FakeChat(over.replies ?? []),
    registry: null,
    sink,
    pusher,
    spot: null,
    now: () => t,
    log: () => {},
    ...over,
  };
  const engine = new Engine(deps);
  return { engine, deps, store, sink, pusher, gateway, nansen, advance: (ms: number) => (t += ms), now: () => t };
}

export const fakePublicClient = {
  waitForTransactionReceipt: async () => ({ status: "success" }),
  estimateGas: async () => 21_000n,
} as unknown as PublicClient;
