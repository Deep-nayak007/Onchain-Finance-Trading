import {
  txRequestSchema,
  type CompileResult,
  type Persona,
  type SlackRequest,
  type TxRequest,
} from './schemas';
import type { Address, Hex } from 'viem';
import * as Haptics from 'expo-haptics';
import { config, requireConfiguredChain } from './config';
import { requireBindings } from '../integration/team';
import { withSigner } from './mera';
import { publicClient } from './chain';
import { api } from './api';
import { demoStore } from '../mocks/store';
import { reviewTransaction } from './transactionReview';
import { ConfirmedActionError, type PendingCallback } from './confirmedAction';
export async function signPrepared(account: Address, prepared: TxRequest): Promise<Hex> {
  if (config.useMocks) throw new Error('Demo mode does not sign or send transactions.');
  const request = txRequestSchema.parse(prepared);
  requireConfiguredChain(request.chainId);
  const bindings = requireBindings();
  if ((await publicClient.getChainId()) !== config.chainId)
    throw new Error(
      'The RPC is serving another network. Check your Monad connection before signing.',
    );
  await reviewTransaction(request);
  const hash = await withSigner(account, (signer) => bindings.sendTx(signer, request));
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60000 });
  if (receipt.status !== 'success')
    throw new Error('The transaction reverted. Your requested change was not applied.');
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  return hash;
}
export async function signRules(account: Address, compiled: CompileResult, persona: Persona['id']) {
  if (config.useMocks) {
    demoStore.activate(compiled.policy, persona);
    return;
  }
  const txHash = await signPrepared(
    account,
    await requireBindings().prepareMandate(account, compiled, persona),
  );
  try {
    await requireBindings().activateAgent(account, persona, txHash);
  } catch {
    throw new ConfirmedActionError(
      `Your rules confirmed onchain, but the trader has not activated yet. Retry activation with transaction ${txHash}.`,
      { kind: 'activate', account, persona, txHash },
    );
  }
  return txHash;
}
export async function pullLeash(account: Address) {
  if (config.useMocks) {
    demoStore.pause();
    return;
  }
  await signPrepared(account, await requireBindings().preparePause(account));
  try {
    await api.kill(account);
  } catch {
    throw new Error(
      'Your onchain pause confirmed. The backend cleanup did not respond; retry cleanup from Home.',
    );
  }
}
export async function resumeTrader(account: Address) {
  if (config.useMocks) {
    demoStore.resume();
    return;
  }
  const txHash = await signPrepared(account, await requireBindings().prepareResume(account));
  try {
    await requireBindings().resumeAgent(account, txHash);
  } catch {
    throw new ConfirmedActionError(
      'Your resume confirmed onchain. The trader setup has not restarted yet; retry setup without signing again.',
      { kind: 'resume', account, txHash },
    );
  }
}
export async function approveSlack(account: Address, request: SlackRequest) {
  if (Date.now() >= Date.parse(request.expiresAt) || request.status !== 'PENDING')
    throw new Error('This request has expired. Wait for a new request from your trader.');
  if (config.useMocks) {
    demoStore.approveSlack();
    return;
  }
  const txHash = await signPrepared(
    account,
    await requireBindings().prepareSlack(account, request),
  );
  try {
    await api.approveSlack(request.id, txHash);
  } catch {
    throw new ConfirmedActionError(
      `Slack was granted onchain. The trader has not acknowledged it yet. Keep this transaction hash: ${txHash}`,
      { kind: 'slack', id: request.id, txHash },
    );
  }
}
export async function retryConfirmedCallback(pending: PendingCallback) {
  if (pending.kind === 'activate')
    await requireBindings().activateAgent(pending.account, pending.persona, pending.txHash);
  else if (pending.kind === 'resume')
    await requireBindings().resumeAgent(pending.account, pending.txHash);
  else await api.approveSlack(pending.id, pending.txHash);
}
