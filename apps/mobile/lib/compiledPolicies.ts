import { keccak256, toBytes } from 'viem';
import { canonicalJSON } from '@leash/shared/canonical';
import { policySchema, type Policy } from './schemas';
const policies = new Map<string, { hash: string; policy: Policy }>();
export function rememberPolicy(account: string, hash: string, policy: Policy) {
  policy = policySchema.parse(policy);
  if (keccak256(toBytes(canonicalJSON(policy))).toLowerCase() !== hash.toLowerCase())
    throw new Error('The policy fingerprint does not match the rules.');
  policies.set(account.toLowerCase(), { hash: hash.toLowerCase(), policy });
  try {
    globalThis.localStorage?.setItem(
      `leash.policy.${account.toLowerCase()}`,
      JSON.stringify(policy),
    );
  } catch {
    // Browser storage can be unavailable; native keeps this session's non-secret rules in memory.
  }
}
export function recallPolicy(account: string): Policy | undefined {
  const cached = policies.get(account.toLowerCase());
  if (cached) return policySchema.parse(cached.policy);
  try {
    const raw = globalThis.localStorage?.getItem(`leash.policy.${account.toLowerCase()}`);
    if (!raw) return undefined;
    const result = policySchema.safeParse(JSON.parse(raw));
    if (!result.success) return undefined;
    const hash = keccak256(toBytes(canonicalJSON(result.data)));
    policies.set(account.toLowerCase(), { hash, policy: result.data });
    return policySchema.parse(result.data);
  } catch {
    return undefined;
  }
}
export function compiledPolicy(account: string, onchainHash: string): Policy | null {
  recallPolicy(account);
  const value = policies.get(account.toLowerCase());
  return value?.hash === onchainHash.toLowerCase() ? policySchema.parse(value.policy) : null;
}
