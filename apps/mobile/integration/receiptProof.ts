import { decodeEventLog, zeroHash, type Address, type Hex, type TransactionReceipt } from 'viem';
import { receiptLogAbi } from '@leash/shared/abis';
import { LEASH } from '@leash/shared/addresses';
import { config, requireConfiguredChain } from '../lib/config';
import { publicClient } from '../lib/chain';
import type { IndexedReceipt, ReceiptDetail, ReceiptStatus } from '../lib/schemas';

export function decodeReceiptProof(
  receipt: Pick<TransactionReceipt, 'status' | 'logs' | 'transactionHash'>,
  contract: Address,
  reasonHash: Hex,
  detail: ReceiptDetail | null,
  createdAt: string,
): IndexedReceipt {
  if (receipt.status !== 'success') throw new Error('The receipt transaction reverted.');
  for (const log of receipt.logs) {
    if (log.removed || log.address.toLowerCase() !== contract.toLowerCase()) continue;
    let event;
    try {
      event = decodeEventLog({
        abi: receiptLogAbi,
        eventName: 'TradeReceipt',
        data: log.data,
        topics: log.topics,
        strict: true,
      });
    } catch {
      continue;
    }
    if (event.args.reasonHash.toLowerCase() !== reasonHash.toLowerCase()) continue;
    const statuses: ReceiptStatus[] = ['EXECUTED', 'REJECTED', 'FAILED', 'SHADOW'];
    const status = statuses[event.args.status];
    if (!status || event.args.seq > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Invalid receipt event.');
    return {
      id: `${receipt.transactionHash}-${event.args.seq}`,
      account: event.args.user,
      seq: Number(event.args.seq),
      agentId: String(event.args.agentId),
      persona: detail?.intent.persona ?? null,
      status,
      usedSlack: event.args.usedSlack,
      execTxHash: event.args.execTxHash === zeroHash ? null : event.args.execTxHash,
      reasonHash: event.args.reasonHash,
      signalHash: event.args.signalHash,
      createdAt,
      detail: detail ?? undefined,
      proofTxHash: receipt.transactionHash,
      anchorSource: 'rpc',
    };
  }
  throw new Error('This transaction contains no matching receipt from the deployed ReceiptLog.');
}

export async function readReceiptProof(
  reasonHash: Hex,
  txHash: Hex,
  detail: ReceiptDetail | null,
): Promise<IndexedReceipt> {
  requireConfiguredChain(await publicClient.getChainId());
  const contract = (config.chainId === 10143 ? LEASH.testnet : LEASH.mainnet).receiptLog.address;
  if (!contract) throw new Error('ReceiptLog is not deployed on this network.');
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  const block = await publicClient.getBlock({ blockHash: receipt.blockHash });
  return decodeReceiptProof(
    receipt,
    contract,
    reasonHash,
    detail,
    new Date(Number(block.timestamp) * 1000).toISOString(),
  );
}
