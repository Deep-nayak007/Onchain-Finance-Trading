// Public evidence supplied by Brain in docs/testnet-evidence.md (deployed API run, step 6).
// These identify a transaction to fetch; they are never used as verification anchors themselves.
export const testnetHandoff = {
  chainId: 10143,
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  apiUrl: 'https://leash-brain-api.onrender.com',
  rpId: 'leash-brain-api.onrender.com',
  // Public demo account (2026-10-14, Brain e2e-flow KEEP_RUNNING): Falcon trader left RUNNING in paper mode; its
  // throwaway key was never stored, only the Referee can pause it. Viewing it grants no signing access.
  account: '0xc9f53D9f3086A4B4a6b6aAb69E09627A8b78d960',
  reasonHash: '0xfded4f2db0ddc886f0b763b736976a03fd7b173e7175d2ad836be691a6cdbfb0',
  receiptTxHash: '0xa4bc104a87c40b1e514e6c01ac9476b6b906eea746cb26d56ba7102df2cbd266',
} as const;
