import { z } from 'zod';
import { keccak256, toBytes } from 'viem';
import { canonicalJSON } from '@leash/shared/canonical';
import { PERSONAS } from '@leash/shared/addresses';
import type { Address } from 'viem';
import { config } from './config';
import { request, ServiceError } from './http';
import { requireConfiguredChain } from './config';
import { recallPolicy, rememberPolicy } from './compiledPolicies';
import { readMandate } from './mandate';
import {
  agentStatusSchema,
  compileSchema,
  apiHealthSchema,
  apiConfigSchema,
  hashSchema,
  traderResponseSchema,
  receiptDetailSchema,
  policySchema,
  slackSchema,
  type Persona,
  type CompileResult,
} from './schemas';
import { demoStore } from '../mocks/store';
import { defaultPolicy, personas } from '../mocks/fixtures';
const acknowledgment = z.unknown(); // No response shape was specified for commands in §7.4.
export const api = {
  health: () => request(config.apiUrl, '/health', apiHealthSchema),
  configuration: () => request(config.apiUrl, '/config', apiConfigSchema),
  status: (account: string) =>
    config.useMocks
      ? Promise.resolve({
          state: demoStore.state,
          persona: demoStore.persona,
          lastTick: new Date().toISOString(),
          lastDecision: null,
        })
      : request(
          config.apiUrl,
          `/agent/status/${encodeURIComponent(account)}`,
          agentStatusSchema,
        ).catch(async (error) => {
          if (error instanceof ServiceError && error.status === 404) {
            const mandate = await readMandate(account as Address);
            return {
              state: mandate ? (mandate.paused ? 'PAUSED' : 'RECOVERY_REQUIRED') : 'NOT_STARTED',
              persona: mandate
                ? (Object.entries(PERSONAS).find(
                    ([, p]) => p.agentId === String(mandate.agentId),
                  )?.[0] ?? null)
                : null,
              lastTick: null,
              lastDecision: null,
            };
          }
          throw error;
        }),
  traders: () =>
    config.useMocks
      ? Promise.resolve(personas.map((persona) => ({ ...persona, stats: null })))
      : request(config.apiUrl, '/traders', z.array(traderResponseSchema)),
  receipt: (hash: string) =>
    config.useMocks
      ? Promise.resolve(demoStore.receipts.find((r) => r.reasonHash === hash)?.detail ?? null)
      : request(config.apiUrl, `/receipts/${encodeURIComponent(hash)}`, receiptDetailSchema).catch(
          (error) => {
            if (error instanceof ServiceError && error.status === 404) return null;
            throw error;
          },
        ),
  policy: (account: string) =>
    request(
      config.apiUrl,
      `/policy/${encodeURIComponent(account)}`,
      z.object({
        policy: policySchema,
        policyHash: hashSchema,
        persona: z.enum(['falcon', 'otter', 'owl']),
      }),
    ).catch((error) => {
      if (error instanceof ServiceError && error.status === 404) return null;
      throw error;
    }),
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
    if (!config.useMocks) {
      requireConfiguredChain((await api.health()).chainId);
      const result = await request(config.apiUrl, '/mandate/compile', compileSchema, {
        account,
        text,
        persona,
      });
      rememberPolicy(account, result.policyHash, result.policy);
      return result;
    }
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
      agentId: personas.find((p) => p.id === persona)!.agentId,
      agentWallet: null,
      perplKey: null,
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
  drip: async (account: string) => {
    if (config.useMocks) return null;
    requireConfiguredChain((await api.health()).chainId);
    return request(
      config.apiUrl,
      '/gas/drip',
      z.object({ txHash: hashSchema, amountMon: z.string().regex(/^\d+(?:\.\d+)?$/) }),
      { account },
    );
  },
  registerDevice: (account: string, expoPushToken: string) =>
    config.useMocks
      ? Promise.resolve(null)
      : request(config.apiUrl, '/devices', acknowledgment, { account, expoPushToken }),
  activate: (body: { account: string; txHash?: string }) =>
    request(config.apiUrl, '/agent/activate', agentStatusSchema, {
      ...body,
      policy: recallPolicy(body.account),
    }),
  kill: async (account: string) => {
    const result = await request(
      config.apiUrl,
      '/agent/kill',
      agentStatusSchema.extend({
        cleanup: z.object({ wallet: z.boolean(), gatewayKey: z.boolean() }).optional(),
      }),
      { account },
    );
    if (result.cleanup && (!result.cleanup.wallet || !result.cleanup.gatewayKey))
      throw new Error(
        'Your onchain pause is confirmed, but backend cleanup is incomplete. Retry cleanup from Home.',
      );
    return result;
  },
  approveSlack: (id: string, txHash: string) =>
    request(
      config.apiUrl,
      `/slack/${encodeURIComponent(id)}/approved`,
      z.object({ request: slackSchema, receipt: receiptDetailSchema.optional() }),
      { txHash },
    ),
  denySlack: async (id: string) => {
    if (config.useMocks) {
      demoStore.slack.status = 'DENIED';
      return null;
    }
    return request(
      config.apiUrl,
      `/slack/${encodeURIComponent(id)}/denied`,
      z.object({ request: slackSchema }),
      {},
    );
  },
};
