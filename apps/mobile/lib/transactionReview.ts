import type { TxRequest } from './schemas';
type Review = { request: TxRequest; resolve: () => void; reject: (error: Error) => void };
let current: Review | null = null;
const listeners = new Set<() => void>();
export const reviewSnapshot = () => current;
export const subscribeReview = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function reviewTransaction(request: TxRequest): Promise<void> {
  if (current) return Promise.reject(new Error('Finish reviewing the current transaction first.'));
  return new Promise((resolve, reject) => {
    current = { request, resolve, reject };
    listeners.forEach((l) => l());
  });
}
export function finishReview(approved: boolean) {
  if (!current) return;
  const pending = current;
  current = null;
  listeners.forEach((l) => l());
  if (approved) pending.resolve();
  else pending.reject(new Error('You cancelled this transaction. Nothing was signed.'));
}
