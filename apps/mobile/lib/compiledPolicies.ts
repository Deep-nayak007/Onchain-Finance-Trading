import type { Policy } from './schemas';
const policies = new Map<string, { hash: string; policy: Policy }>();
export function rememberPolicy(account: string, hash: string, policy: Policy) {
  policies.set(account.toLowerCase(), { hash: hash.toLowerCase(), policy });
}
export function compiledPolicy(account: string, onchainHash: string): Policy | null {
  const value = policies.get(account.toLowerCase());
  return value?.hash === onchainHash.toLowerCase() ? value.policy : null;
}
