// Public evidence supplied by Brain in docs/testnet-evidence.md (deployed API run, step 6).
// These identify a transaction to fetch; they are never used as verification anchors themselves.
export const testnetHandoff = {
  chainId: 10143,
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  apiUrl: 'https://leash-brain-api.onrender.com',
  rpId: 'leash-brain-api.onrender.com',
  // Public throwaway account from docs/testnet-evidence.md; viewing it grants no signing access.
  account: '0xE7f1FFcC13C1384a2a1d7eaC19edF0F69e85f4FD',
  reasonHash: '0x86e8ca275306825cbd9aed2c7d4dd40bc4a71f055823dd712cec166e70bb75c1',
  receiptTxHash: '0x8d35d96b72148be12f25514366f98fc63c26970ad310ad24bee0dfd0f30869e4',
} as const;
