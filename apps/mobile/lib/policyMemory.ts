// Compatibility with Brain's handoff: use the same validated, hash-bound cache as Face.
import { keccak256, toBytes } from 'viem';
import { canonicalJSON } from '@leash/shared/canonical';
import { rememberPolicy as rememberCompiledPolicy } from './compiledPolicies';
import { policySchema } from './schemas';
export { recallPolicy } from './compiledPolicies';
export function rememberPolicy(account: string, value: unknown) {
  const policy = policySchema.parse(value);
  rememberCompiledPolicy(account, keccak256(toBytes(canonicalJSON(policy))), policy);
}
