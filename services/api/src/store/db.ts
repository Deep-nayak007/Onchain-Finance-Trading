// SQLite store (node:sqlite, no native build). One file, small typed helpers per table.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PersonaId, Policy, ReceiptDetail, SlackRequest } from "@leash/shared";

const SCHEMA = `
create table if not exists users (
  account text primary key,
  persona text not null,
  policy_json text not null,
  policy_hash text not null,
  state text not null default 'IDLE',
  last_tick text,
  last_decision_json text,
  updated_at integer not null
);
create table if not exists policies (
  policy_hash text primary key,
  policy_json text not null,
  created_at integer not null
);
create table if not exists receipt_details (
  reason_hash text primary key,
  account text,
  persona text not null,
  status text not null,
  detail_json text not null,
  log_tx_hash text,
  created_at integer not null
);
create index if not exists receipt_account on receipt_details(account, created_at);
create table if not exists slack_requests (
  id text primary key,
  account text not null,
  status text not null,
  request_json text not null,
  intent_json text not null,
  created_at integer not null
);
create table if not exists devices (
  account text not null,
  token text not null,
  created_at integer not null,
  primary key (account, token)
);
create table if not exists drips (
  address text primary key,
  tx_hash text,
  created_at integer not null
);
create table if not exists wallets (
  key text primary key,          -- "<account>:<persona>" or "persona:<persona>"
  wallet_id text not null,
  address text not null,
  policy_id text,
  created_at integer not null
);
create table if not exists kv (
  k text primary key,
  v text not null,
  updated_at integer not null
);
`;

export type UserRow = {
  account: string;
  persona: PersonaId;
  policy: Policy;
  policyHash: string;
  state: "IDLE" | "RUNNING" | "PAUSED" | "KILLED";
  lastTick: string | null;
  lastDecision: unknown;
};

export type WalletRow = { key: string; walletId: string; address: `0x${string}`; policyId: string | null };

type Row = Record<string, unknown>;

export class Store {
  readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("pragma journal_mode = wal;");
    this.db.exec(SCHEMA);
  }

  // ---- policies / users ----
  savePolicy(policyHash: string, policy: Policy) {
    this.db
      .prepare("insert or ignore into policies (policy_hash, policy_json, created_at) values (?, ?, ?)")
      .run(policyHash.toLowerCase(), JSON.stringify(policy), Date.now());
  }

  getPolicy(policyHash: string): Policy | null {
    const r = this.db.prepare("select policy_json from policies where policy_hash = ?").get(policyHash.toLowerCase()) as Row | undefined;
    return r ? (JSON.parse(String(r.policy_json)) as Policy) : null;
  }

  upsertUser(u: Pick<UserRow, "account" | "persona" | "policy" | "policyHash" | "state">) {
    this.db
      .prepare(
        `insert into users (account, persona, policy_json, policy_hash, state, updated_at) values (?, ?, ?, ?, ?, ?)
         on conflict(account) do update set persona=excluded.persona, policy_json=excluded.policy_json,
           policy_hash=excluded.policy_hash, state=excluded.state, updated_at=excluded.updated_at`,
      )
      .run(u.account.toLowerCase(), u.persona, JSON.stringify(u.policy), u.policyHash, u.state, Date.now());
  }

  setUserState(account: string, state: UserRow["state"]) {
    this.db.prepare("update users set state = ?, updated_at = ? where account = ?").run(state, Date.now(), account.toLowerCase());
  }

  recordTick(account: string, decision: unknown) {
    this.db
      .prepare("update users set last_tick = ?, last_decision_json = ?, updated_at = ? where account = ?")
      .run(new Date().toISOString(), decision === undefined ? null : JSON.stringify(decision), Date.now(), account.toLowerCase());
  }

  getUser(account: string): UserRow | null {
    const r = this.db.prepare("select * from users where account = ?").get(account.toLowerCase()) as Row | undefined;
    return r ? toUser(r) : null;
  }

  usersInState(state: UserRow["state"]): UserRow[] {
    return (this.db.prepare("select * from users where state = ?").all(state) as Row[]).map(toUser);
  }

  // ---- receipts ----
  saveReceipt(d: ReceiptDetail, meta: { account: string | null; status: string }) {
    this.db
      .prepare(
        `insert into receipt_details (reason_hash, account, persona, status, detail_json, created_at) values (?, ?, ?, ?, ?, ?)
         on conflict(reason_hash) do update set detail_json=excluded.detail_json, status=excluded.status`,
      )
      .run(d.reasonHash.toLowerCase(), meta.account?.toLowerCase() ?? null, d.intent.persona, meta.status, JSON.stringify(d), Date.now());
  }

  updateReceipt(reasonHash: string, patch: Partial<Pick<ReceiptDetail, "confirmedAtMs" | "execTxHash">> & { logTxHash?: string }) {
    const cur = this.getReceipt(reasonHash);
    if (!cur) return;
    const { logTxHash, ...rest } = patch;
    const next = { ...cur, ...rest };
    this.db
      .prepare("update receipt_details set detail_json = ?, log_tx_hash = coalesce(?, log_tx_hash) where reason_hash = ?")
      .run(JSON.stringify(next), logTxHash ?? null, reasonHash.toLowerCase());
  }

  getReceipt(reasonHash: string): ReceiptDetail | null {
    const r = this.db.prepare("select detail_json from receipt_details where reason_hash = ?").get(reasonHash.toLowerCase()) as Row | undefined;
    return r ? (JSON.parse(String(r.detail_json)) as ReceiptDetail) : null;
  }

  /** Executed trades for rate limit / cooldown (local mirror; Envio is the source of history). */
  executedSince(account: string, sinceMs: number): { createdAt: number }[] {
    return (
      this.db
        .prepare("select created_at from receipt_details where account = ? and status = 'EXECUTED' and created_at >= ? order by created_at desc")
        .all(account.toLowerCase(), sinceMs) as Row[]
    ).map((r) => ({ createdAt: Number(r.created_at) }));
  }

  lastExecutedAt(account: string): number | null {
    const r = this.db
      .prepare("select max(created_at) as t from receipt_details where account = ? and status = 'EXECUTED'")
      .get(account.toLowerCase()) as Row | undefined;
    return r?.t == null ? null : Number(r.t);
  }

  // ---- slack ----
  saveSlack(req: SlackRequest, intent: unknown) {
    this.db
      .prepare(
        `insert into slack_requests (id, account, status, request_json, intent_json, created_at) values (?, ?, ?, ?, ?, ?)
         on conflict(id) do update set status=excluded.status, request_json=excluded.request_json`,
      )
      .run(req.id, req.account.toLowerCase(), req.status, JSON.stringify(req), JSON.stringify(intent), Date.now());
  }

  getSlack(id: string): { request: SlackRequest; intent: unknown } | null {
    const r = this.db.prepare("select request_json, intent_json from slack_requests where id = ?").get(id) as Row | undefined;
    return r ? { request: JSON.parse(String(r.request_json)) as SlackRequest, intent: JSON.parse(String(r.intent_json)) } : null;
  }

  pendingSlack(account: string): SlackRequest[] {
    return (
      this.db.prepare("select request_json from slack_requests where account = ? and status = 'PENDING' order by created_at desc").all(account.toLowerCase()) as Row[]
    ).map((r) => JSON.parse(String(r.request_json)) as SlackRequest);
  }

  // ---- devices ----
  addDevice(account: string, token: string) {
    this.db.prepare("insert or ignore into devices (account, token, created_at) values (?, ?, ?)").run(account.toLowerCase(), token, Date.now());
  }

  devices(account: string): string[] {
    return (this.db.prepare("select token from devices where account = ?").all(account.toLowerCase()) as Row[]).map((r) => String(r.token));
  }

  // ---- drips ----
  /** Atomically claims the drip slot for an address. False if already claimed. */
  claimDrip(address: string): boolean {
    const res = this.db.prepare("insert or ignore into drips (address, created_at) values (?, ?)").run(address.toLowerCase(), Date.now());
    return Number(res.changes) === 1;
  }

  setDripTx(address: string, txHash: string | null) {
    if (txHash === null) this.db.prepare("delete from drips where address = ?").run(address.toLowerCase());
    else this.db.prepare("update drips set tx_hash = ? where address = ?").run(txHash, address.toLowerCase());
  }

  dripsSince(sinceMs: number): number {
    const r = this.db.prepare("select count(*) as n from drips where created_at >= ?").get(sinceMs) as Row;
    return Number(r.n);
  }

  // ---- wallets ----
  getWallet(key: string): WalletRow | null {
    const r = this.db.prepare("select * from wallets where key = ?").get(key) as Row | undefined;
    return r ? { key, walletId: String(r.wallet_id), address: String(r.address) as `0x${string}`, policyId: r.policy_id == null ? null : String(r.policy_id) } : null;
  }

  saveWallet(w: WalletRow) {
    this.db
      .prepare(
        `insert into wallets (key, wallet_id, address, policy_id, created_at) values (?, ?, ?, ?, ?)
         on conflict(key) do update set policy_id=excluded.policy_id`,
      )
      .run(w.key, w.walletId, w.address, w.policyId, Date.now());
  }

  // ---- kv (caches) ----
  getKv<T>(k: string, maxAgeMs: number): T | null {
    const r = this.db.prepare("select v, updated_at from kv where k = ?").get(k) as Row | undefined;
    if (!r || Date.now() - Number(r.updated_at) > maxAgeMs) return null;
    return JSON.parse(String(r.v)) as T;
  }

  setKv(k: string, v: unknown) {
    this.db
      .prepare("insert into kv (k, v, updated_at) values (?, ?, ?) on conflict(k) do update set v=excluded.v, updated_at=excluded.updated_at")
      .run(k, JSON.stringify(v), Date.now());
  }
}

function toUser(r: Row): UserRow {
  return {
    account: String(r.account),
    persona: String(r.persona) as PersonaId,
    policy: JSON.parse(String(r.policy_json)) as Policy,
    policyHash: String(r.policy_hash),
    state: String(r.state) as UserRow["state"],
    lastTick: r.last_tick == null ? null : String(r.last_tick),
    lastDecision: r.last_decision_json == null ? null : JSON.parse(String(r.last_decision_json)),
  };
}
