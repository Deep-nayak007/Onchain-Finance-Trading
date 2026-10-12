import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { walletError } from './mera';
import { ConfirmedActionError, type PendingCallback } from './confirmedAction';
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCallback | null>(null);
  const client = useQueryClient();
  const locked = useRef(false);
  async function run(fn: () => Promise<unknown> | unknown, message?: string) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      await client.invalidateQueries();
      setPending(null);
      if (message) setSuccess(message);
      return true;
    } catch (e) {
      setError(walletError(e));
      if (e instanceof ConfirmedActionError) setPending(e.pending);
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    success,
    pending,
    run,
    clear: () => {
      setError(null);
      setSuccess(null);
      setPending(null);
    },
  };
}
