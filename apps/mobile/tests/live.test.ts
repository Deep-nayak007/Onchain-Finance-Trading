import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, zeroHash, type TransactionReceipt } from 'viem';
import { receiptLogAbi } from '@leash/shared/abis';
import { parseChainId, requireConfiguredChain, config } from '../lib/config';
import { bookSchema } from '../lib/gateway';
import {
  compileSchema,
  riskSchema,
  riskWireSchema,
  spotPrepareSchema,
  txRequestSchema,
} from '../lib/schemas';
import { receiptFixtures, defaultPolicy } from '../mocks/fixtures';
import { decodeReceiptProof } from '../integration/receiptProof';
import { verifyReceipt } from '../lib/verify';
import { request, ServiceConnectionError, ServiceError } from '../lib/http';
import { z } from 'zod';

test('only Monad networks are supported; a prepared request must match the selected chain', () => {
  assert.equal(parseChainId('10143'), 10143);
  assert.equal(parseChainId('143'), 143);
  for (const value of ['1', '', 'NaN', '0x1']) assert.throws(() => parseChainId(value));
  assert.throws(
    () => requireConfiguredChain(config.chainId === 143 ? 10143 : 143),
    /another network/,
  );
  assert.ok(
    txRequestSchema.safeParse({
      to: '0x1111111111111111111111111111111111111111',
      data: '0x',
      value: '0',
      gas: '21000',
      chainId: 10143,
    }).success,
  );
});
test('gateway timestamp and percentage strings normalize without losing decimal balances', () => {
  const wire = {
    account: '0x1111111111111111111111111111111111111111',
    ts: 1791839233,
    equityUsd: '0.000001',
    collateralUsd: '10',
    marginUsedUsd: '2',
    weeklyPnlPct: '-3.45',
    fundingPaidUsd: '0',
    slackLeftUsd: '4',
    positions: [
      {
        market: 'MON-PERP',
        side: 'LONG',
        sizeUsd: '10',
        entryPrice: '0.02',
        markPrice: '0.02',
        liqPrice: '0.01',
        liqDistancePct: '35.2',
        unrealizedPnlUsd: '-1',
      },
    ],
    exposureByMarket: { 'MON-PERP': '10' },
  };
  const result = riskSchema.parse(wire);
  assert.equal(result.ts, wire.ts);
  assert.equal(result.weeklyPnlPct, -3.45);
  assert.equal(result.positions[0]!.liqDistancePct, 35.2);
  assert.equal(result.equityUsd, '0.000001');
  assert.equal(
    riskWireSchema.safeParse({ ...wire, ts: '2026-10-12', weeklyPnlPct: 3.45 }).success,
    false,
  );
  assert.deepEqual(
    bookSchema.parse({ ts: wire.ts, bids: [{ price: '0.02', size: '100' }], asks: [] }).bids,
    [['0.02', '100']],
  );
});
test('compile retains null wallet/key warnings; swap refuses an unbounded minimum output', () => {
  const result = compileSchema.parse({
    policy: defaultPolicy,
    policyHash: zeroHash,
    leashCard: [],
    warnings: ['Wallet unavailable'],
    agentId: '0',
    agentWallet: null,
    perplKey: null,
  });
  assert.equal(result.agentWallet, null);
  assert.equal(result.warnings[0], 'Wallet unavailable');
  const tx = {
    to: '0x1111111111111111111111111111111111111111',
    data: '0x',
    value: '0',
    gas: '21000',
    chainId: 10143,
  };
  assert.equal(
    spotPrepareSchema.safeParse({ txs: [tx], estimatedOut: 10, minOut: 0 }).success,
    false,
  );
  assert.equal(
    spotPrepareSchema.safeParse({ txs: [tx], estimatedOut: 10, minOut: 11 }).success,
    false,
  );
});
const contract = '0x2222222222222222222222222222222222222222';
const user = '0x1111111111111111111111111111111111111111';
const detail = receiptFixtures[1]!.detail!;
const log = {
  address: contract,
  removed: false,
  topics: encodeEventTopics({
    abi: receiptLogAbi,
    eventName: 'TradeReceipt',
    args: { user, agentId: 0n, seq: 5n },
  }),
  data: encodeAbiParameters(
    [
      { type: 'uint8' },
      { type: 'bytes32' },
      { type: 'int8' },
      { type: 'uint128' },
      { type: 'uint256' },
      { type: 'uint8' },
      { type: 'bool' },
      { type: 'bytes32' },
      { type: 'bytes32' },
      { type: 'bytes32' },
    ],
    [
      0,
      zeroHash,
      1,
      15000000n,
      0n,
      0,
      detail.decision.usedSlack,
      detail.reasonHash as `0x${string}`,
      detail.signalHash as `0x${string}`,
      zeroHash,
    ],
  ),
};
const receipt = {
  status: 'success',
  transactionHash: zeroHash,
  logs: [log],
} as unknown as TransactionReceipt;
test('a confirmed log from the actual contract supplies an independent anchor', () => {
  const anchor = decodeReceiptProof(
    receipt,
    contract,
    detail.reasonHash as `0x${string}`,
    detail,
    '2026-10-12T00:00:00Z',
  );
  assert.equal(anchor.account?.toLowerCase(), user);
  assert.equal(anchor.seq, 5);
  assert.equal(verifyReceipt(detail, anchor, false).state, 'verified');
  assert.equal(
    verifyReceipt(
      { ...detail, decision: { ...detail.decision, usedSlack: !detail.decision.usedSlack } },
      anchor,
      false,
    ).state,
    'mismatch',
  );
  assert.equal(
    verifyReceipt({ ...detail, execTxHash: `0x${'11'.repeat(32)}` }, anchor, false).state,
    'mismatch',
  );
});
test('missing Brain reasoning retains paper/slack metadata without an invented persona or verification', () => {
  const anchor = decodeReceiptProof(
    receipt,
    contract,
    detail.reasonHash as `0x${string}`,
    null,
    '2026-10-12T00:00:00Z',
  );
  assert.equal(anchor.detail, undefined);
  assert.equal(anchor.persona, null);
  assert.equal(anchor.execTxHash, null);
  assert.equal(anchor.usedSlack, detail.decision.usedSlack);
  assert.equal(anchor.reasonHash, detail.reasonHash);
});
test('reverted, removed, wrong-contract and wrong-fingerprint logs cannot become verified', () => {
  assert.throws(
    () =>
      decodeReceiptProof(
        { ...receipt, status: 'reverted' },
        contract,
        detail.reasonHash as `0x${string}`,
        detail,
        '',
      ),
    /reverted/,
  );
  assert.throws(
    () => decodeReceiptProof(receipt, user, detail.reasonHash as `0x${string}`, detail, ''),
    /no matching/,
  );
  assert.throws(() => decodeReceiptProof(receipt, contract, zeroHash, detail, ''), /no matching/);
  assert.throws(
    () =>
      decodeReceiptProof(
        { ...receipt, logs: [{ ...receipt.logs[0]!, removed: true }] },
        contract,
        detail.reasonHash as `0x${string}`,
        detail,
        '',
      ),
    /no matching/,
  );
});
test('browser fetch failures identify the service without revealing URL credentials', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(
    request('https://example.test/private?token=hidden', '/health', z.unknown()),
    (error: unknown) =>
      error instanceof ServiceConnectionError &&
      error.message.includes('example.test') &&
      !error.message.includes('hidden'),
  );
});
test('API errors retain their status for one-time drip handling', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify({ error: 'already dripped to this address' }), { status: 409 }),
  );
  await assert.rejects(
    request('https://example.test', '/gas/drip', z.unknown(), { account: user }),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.status === 409 &&
      error.message.includes('already dripped'),
  );
});
