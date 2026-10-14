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
  reasonHash: '0x3bf7d6427c8ba39b934d7843b18a68ce2ef92bc766c9b0b50bafcd433984d3b6',
  receiptTxHash: '0x08af80d053624c74d4caeb9e891e7edee47ca07599d28a3845f175aecce0b24c',
} as const;
