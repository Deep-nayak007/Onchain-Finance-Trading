import { keccak256, toBytes } from 'viem';
import { canonicalJSON } from '@leash/shared/canonical';
import type { ReceiptDetail } from './schemas';
export type Verification = {
  state: 'verified' | 'sample' | 'mismatch' | 'pending';
  label: string;
  computedHash: string;
  latencyMs: number | null;
};
export function verifyReceipt(
  detail: ReceiptDetail,
  anchor: {
    reasonHash: string | null;
    signalHash: string | null;
    usedSlack?: boolean;
    execTxHash?: string | null;
  },
  isDemo: boolean,
): Verification {
  const computedHash = keccak256(
    toBytes(canonicalJSON({ intent: detail.intent, decision: detail.decision })),
  );
  const signals = keccak256(toBytes(canonicalJSON(detail.signalsSnapshot)));
  const latencyMs =
    detail.confirmedAtMs !== null && detail.confirmedAtMs >= detail.decidedAtMs
      ? detail.confirmedAtMs - detail.decidedAtMs
      : null;
  if (!anchor.reasonHash || !anchor.signalHash)
    return { state: 'pending', label: 'Waiting for the onchain receipt', computedHash, latencyMs };
  if (
    computedHash.toLowerCase() !== anchor.reasonHash.toLowerCase() ||
    computedHash.toLowerCase() !== detail.reasonHash.toLowerCase() ||
    signals.toLowerCase() !== anchor.signalHash.toLowerCase() ||
    signals.toLowerCase() !== detail.signalHash.toLowerCase() ||
    (anchor.usedSlack !== undefined && anchor.usedSlack !== detail.decision.usedSlack) ||
    ('execTxHash' in anchor &&
      anchor.execTxHash?.toLowerCase() !== detail.execTxHash?.toLowerCase())
  ) {
    return {
      state: 'mismatch',
      label: 'Doesn’t match · do not trust this receipt',
      computedHash,
      latencyMs,
    };
  }
  if (latencyMs === null)
    return {
      state: 'pending',
      label: 'Hash matches · confirmation pending',
      computedHash,
      latencyMs,
    };
  return {
    state: isDemo ? 'sample' : 'verified',
    label: isDemo
      ? 'Sample hash matches · not onchain'
      : `✓ matches onchain · ${(latencyMs / 1000).toFixed(1)} s`,
    computedHash,
    latencyMs,
  };
}
