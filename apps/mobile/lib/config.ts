export const config = {
  useMocks: process.env.EXPO_PUBLIC_USE_MOCKS !== 'false',
  chainId: Number(process.env.EXPO_PUBLIC_CHAIN_ID || '143'),
  rpcUrl: process.env.EXPO_PUBLIC_RPC_URL || 'https://rpc.monad.xyz',
  apiUrl: process.env.EXPO_PUBLIC_API_URL || '',
  gatewayUrl: process.env.EXPO_PUBLIC_GATEWAY_URL || '',
  envioUrl: process.env.EXPO_PUBLIC_ENVIO_URL || '',
  rpId: process.env.EXPO_PUBLIC_PASSKEY_RP_ID || '',
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '',
};
export function requireMainnet() {
  if (config.chainId !== 143)
    throw new Error('Trading requires Monad chain 143. Use the separate testnet proof for 10143.');
}
