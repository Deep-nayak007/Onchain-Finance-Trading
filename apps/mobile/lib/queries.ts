import { useQuery } from '@tanstack/react-query';
import { useSession } from './session';
import { api } from './api';
import { gateway } from './gateway';
import { envio } from './envio';
export const useRisk = () => {
  const { account } = useSession();
  return useQuery({
    queryKey: ['risk', account],
    queryFn: () => gateway.risk(account!),
    enabled: !!account,
    refetchInterval: 4000,
  });
};
export const useStatus = () => {
  const { account } = useSession();
  return useQuery({
    queryKey: ['status', account],
    queryFn: () => api.status(account!),
    enabled: !!account,
    refetchInterval: 3000,
  });
};
export const useReceipts = () => {
  const { account } = useSession();
  return useQuery({
    queryKey: ['receipts', account],
    queryFn: () => envio.receipts(account!),
    enabled: !!account,
    refetchInterval: 3000,
  });
};
export const useSlack = () => {
  const { account } = useSession();
  return useQuery({
    queryKey: ['slack', account],
    queryFn: () => api.pendingSlack(account!),
    enabled: !!account,
    refetchInterval: 3000,
  });
};
export const usePolicy = () => {
  const { account } = useSession();
  return useQuery({
    queryKey: ['policy', account],
    queryFn: () => envio.policy(account!),
    enabled: !!account,
    refetchInterval: 4000,
  });
};
