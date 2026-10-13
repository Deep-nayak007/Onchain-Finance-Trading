import { z } from 'zod';
import { zeroHash, type Address, type Hex } from 'viem';
import { PERSONAS } from '@leash/shared/addresses';
import { queryEnvio } from '../lib/envioTransport';
import { api } from '../lib/api';
import { addressSchema, hashSchema, type IndexedReceipt } from '../lib/schemas';
// Query fields are taken from packages/shared/queries.graphql, owned by Rails.
const fields =
  'id seq agentId venue market side sizeUsd6 price1e18 status usedSlack reasonHash signalHash execTxHash blockTimestamp txHash';
export const receiptByHashQuery = `query ReceiptByReasonHash($reasonHash: String!) { Receipt(where: { reasonHash: { _eq: $reasonHash } }, limit: 1) { user_id ${fields} } }`;
export const feedByUserQuery = `query FeedByUser($user: String!, $limit: Int = 50) { Receipt(where: { user_id: { _eq: $user } }, order_by: { seq: desc }, limit: $limit) { ${fields} } }`;
const uint = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform(String);
const rowSchema = z.object({
  id: z.string(),
  user_id: addressSchema.optional(),
  seq: uint,
  agentId: uint,
  status: z.enum(['EXECUTED', 'REJECTED', 'FAILED', 'SHADOW']),
  reasonHash: hashSchema,
  signalHash: hashSchema,
  execTxHash: hashSchema.nullable(),
  usedSlack: z.boolean(),
  blockTimestamp: uint,
  txHash: hashSchema,
});
const responseSchema = z.object({ Receipt: z.array(rowSchema) });
async function view(row: z.infer<typeof rowSchema>, account?: Address): Promise<IndexedReceipt> {
  const detail = await api.receipt(row.reasonHash);
  const seq = Number(row.seq);
  if (!Number.isSafeInteger(seq)) throw new Error('Receipt sequence is out of range.');
  return {
    id: row.id,
    account: row.user_id ?? account,
    seq,
    agentId: row.agentId,
    persona:
      detail?.intent.persona ??
      (Object.keys(PERSONAS) as (keyof typeof PERSONAS)[]).find(
        (id) => PERSONAS[id].agentId === row.agentId,
      ) ??
      null,
    status: row.status,
    reasonHash: row.reasonHash,
    signalHash: row.signalHash,
    execTxHash: row.execTxHash === zeroHash ? null : row.execTxHash,
    usedSlack: row.usedSlack,
    createdAt: new Date(Number(row.blockTimestamp) * 1000).toISOString(),
    proofTxHash: row.txHash,
    anchorSource: 'envio',
    detail: detail ?? undefined,
  };
}
export async function readIndexedReceipt(
  account: Address | null,
  reasonHash: Hex,
): Promise<IndexedReceipt | null> {
  const result = await queryEnvio(receiptByHashQuery, responseSchema, {
    reasonHash: reasonHash.toLowerCase(),
  });
  const row = result.Receipt[0];
  if (!row) return null;
  if (
    row.reasonHash.toLowerCase() !== reasonHash.toLowerCase() ||
    (account && row.user_id?.toLowerCase() !== account.toLowerCase())
  )
    throw new Error('The indexed receipt belongs to another account or fingerprint.');
  return view(row);
}
export async function readIndexedFeed(account: Address): Promise<IndexedReceipt[]> {
  const result = await queryEnvio(feedByUserQuery, responseSchema, {
    user: account.toLowerCase(),
    limit: 50,
  });
  return Promise.all(result.Receipt.map((row) => view(row, account)));
}
export async function readIndexedPnl(agentId: string): Promise<number[]> {
  const result = await queryEnvio(
    `query PnlByDay($agentId: numeric!) { PnlSnapshot(where: { agentId: { _eq: $agentId } }, order_by: { day: asc }) { id day realizedPnlUsd shadowPnlUsd cumulativeRealizedUsd equityUsd } }`,
    z.object({
      PnlSnapshot: z.array(
        z.object({ cumulativeRealizedUsd: z.string().regex(/^-?\d+(?:\.\d+)?$/) }),
      ),
    }),
    { agentId },
  );
  return result.PnlSnapshot.map((row) => Number(row.cumulativeRealizedUsd));
}
