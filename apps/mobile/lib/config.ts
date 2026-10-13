export const config = {
  useMocks: process.env.EXPO_PUBLIC_USE_MOCKS !== 'false',
  chainId: Number(process.env.EXPO_PUBLIC_CHAIN_ID || '143'),
  rpcUrl: process.env.EXPO_PUBLIC_RPC_URL || 'https://rpc.monad.xyz',
  apiUrl: process.env.EXPO_PUBLIC_API_URL || '',
  gatewayUrl: process.env.EXPO_PUBLIC_GATEWAY_URL || '',
  envioUrl: process.env.EXPO_PUBLIC_ENVIO_URL || '',
  // Optional one-line file holding the CURRENT Envio URL (rotated when a tunnel restarts); preferred over envioUrl.
  envioUrlPointer: process.env.EXPO_PUBLIC_ENVIO_URL_POINTER || '',
  rpId: process.env.EXPO_PUBLIC_PASSKEY_RP_ID || '',
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '',
};
// Monad mainnet (143) or testnet (10143); the network is a config switch (EXPO_PUBLIC_CHAIN_ID).
export const SUPPORTED_CHAINS = [143, 10143] as const;
export const isTestnet = config.chainId === 10143;
export const networkLabel = isTestnet ? 'Monad testnet · 10143' : 'Monad · 143';
export function requireMainnet() {
  if (!(SUPPORTED_CHAINS as readonly number[]).includes(config.chainId))
    throw new Error(`Unsupported network ${config.chainId}. Set EXPO_PUBLIC_CHAIN_ID to 143 or 10143.`);
}
