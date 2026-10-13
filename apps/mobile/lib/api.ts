import { z } from 'zod';
import { keccak256, toBytes } from 'viem';
import { canonicalJSON } from '@leash/shared/canonical';
import { config } from './config';
import { HttpError, request } from './http';
import {
  agentStatusSchema,
  compileSchema,
  personaSchema,
  receiptDetailSchema,
  slackSchema,
  type Persona,
  type CompileResult,
} from './schemas';
import { demoStore } from '../mocks/store';
import { defaultPolicy, personas } from '../mocks/fixtures';
const acknowledgment = z.unknown(); // No response shape was specified for commands in §7.4.
export const api = {
  status: (account: string) =>
    config.useMocks
      ? Promise.resolve({
          state: demoStore.state,
          persona: demoStore.persona,
          lastTick: new Date().toISOString(),
          lastDecision: null,
        })
      : request(config.apiUrl, `/agent/status/${encodeURIComponent(account)}`, agentStatusSchema),
  traders: () =>
    config.useMocks
      ? Promise.resolve(personas)
      : request(config.apiUrl, '/traders', z.array(personaSchema)),
  receipt: (hash: string) =>
    config.useMocks
      ? Promise.resolve(demoStore.receipts.find((r) => r.reasonHash === hash)?.detail ?? null)
      : request(config.apiUrl, `/receipts/${encodeURIComponent(hash)}`, receiptDetailSchema),
  pendingSlack: (account: string) =>
    config.useMocks
      ? Promise.resolve(
          demoStore.slack.status === 'PENDING' && Date.now() < Date.parse(demoStore.slack.expiresAt)
            ? [demoStore.slack]
            : [],
        )
      : request(
          config.apiUrl,
          `/slack/pending/${encodeURIComponent(account)}`,
          z.array(slackSchema),
        ),
  compile: async (
    account: string,
    text: string,
    persona: Persona['id'],
  ): Promise<CompileResult> => {
    if (!config.useMocks)
      return request(config.apiUrl, '/mandate/compile', compileSchema, { account, text, persona });
    // Deliberately a predictable sample card. No AI service is implied in demo mode.
    const policy = { ...(personas.find((p) => p.id === persona)?.defaultPolicy ?? defaultPolicy) };
    const leverage = text.match(/(\d+(?:\.\d+)?)\s*x\b/i)?.[1];
    const size = text.match(/\$(\d+(?:\.\d+)?)\s*(?:per trade|a trade|each|trade)/i)?.[1];
    const loss = text.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
    if (leverage) policy.maxLeverage = Math.max(1, Math.min(5, Number(leverage)));
    if (size) policy.maxNotionalUsd = String(Math.max(1, Math.min(100, Number(size))));
    if (loss) policy.maxWeeklyLossPct = Math.max(0.1, Math.min(5, Number(loss)));
    return {
      policy,
      policyHash: keccak256(toBytes(canonicalJSON(policy))),
      leashCard: [
        `Only ${policy.markets.join(' and ')}`,
        `Up to ${policy.maxLeverage}x leverage`,
        `No more than $${policy.maxNotionalUsd} per trade`,
        `Pause at ${policy.maxWeeklyLossPct}% weekly loss`,
        'Ask you before stretching a rule',
        'Your trader can never withdraw',
      ],
      warnings: ['Sample rule card. Review every line; the live AI compiler is not connected.'],
    };
  },
  // One drip per address: a 409 means this wallet already received its gas, which is success for the user.
  drip: (account: string) =>
    config.useMocks
      ? Promise.resolve(null)
      : request(config.apiUrl, '/gas/drip', acknowledgment, { account }).catch((e: unknown) => {
          if (e instanceof HttpError && e.status === 409) return null;
          throw e;
        }),
  registerDevice: (account: string, expoPushToken: string) =>
    config.useMocks
      ? Promise.resolve(null)
      : request(config.apiUrl, '/devices', acknowledgment, { account, expoPushToken }),
  activate: (body: unknown) => request(config.apiUrl, '/agent/activate', acknowledgment, body),
  kill: (account: string) => request(config.apiUrl, '/agent/kill', acknowledgment, { account }),
  approveSlack: (id: string, txHash: string) =>
    request(config.apiUrl, `/slack/${encodeURIComponent(id)}/approved`, acknowledgment, { txHash }),
  denySlack: async (id: string) => {
    if (config.useMocks) {
      demoStore.slack.status = 'DENIED';
      return null;
    }
    return request(config.apiUrl, `/slack/${encodeURIComponent(id)}/denied`, acknowledgment, {});
  },
};
