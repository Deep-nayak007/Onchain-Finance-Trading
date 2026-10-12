import type { Address, Hex } from 'viem';
import type { Persona } from './schemas';
export type PendingCallback =
  | { kind: 'activate'; account: Address; persona: Persona['id']; txHash: Hex }
  | { kind: 'slack'; id: string; txHash: Hex }
  | { kind: 'resume'; account: Address; txHash: Hex };
export class ConfirmedActionError extends Error {
  constructor(
    message: string,
    public readonly pending: PendingCallback,
  ) {
    super(message);
    this.name = 'ConfirmedActionError';
  }
}
