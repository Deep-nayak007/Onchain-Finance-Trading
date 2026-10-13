// Compiled rules are not secret; keep the last signed policy per account so a restarted Brain can be re-supplied.
const policyMemory = new Map<string, unknown>();
export function rememberPolicy(account: string, policy: unknown) {
  const key = `leash.policy.${account.toLowerCase()}`;
  policyMemory.set(key, policy);
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(policy));
  } catch {
    // storage unavailable (private mode / native): memory copy still works this session
  }
}
export function recallPolicy(account: string): unknown {
  const key = `leash.policy.${account.toLowerCase()}`;
  if (policyMemory.has(key)) return policyMemory.get(key);
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}
