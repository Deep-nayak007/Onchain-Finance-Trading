import { serviceUrls } from './serviceUrls';
import { testnetHandoff } from '../integration/testnet';
export type MonadChainId = 143 | 10143;
export function parseChainId(value: string | number): MonadChainId {
  const id = Number(value);
  if (id !== 143 && id !== 10143)
    throw new Error('Choose Monad mainnet (143) or Monad testnet (10143).');
  return id;
}
export const networkName = (id: MonadChainId) => (id === 10143 ? 'Monad testnet' : 'Monad mainnet');
const chainId = parseChainId(process.env.EXPO_PUBLIC_CHAIN_ID || '143');
export const config = {
  useMocks: process.env.EXPO_PUBLIC_USE_MOCKS !== 'false',
  chainId,
  networkName: networkName(chainId),
  rpcUrl:
    process.env.EXPO_PUBLIC_RPC_URL ||
    (chainId === 10143 ? 'https://testnet-rpc.monad.xyz' : 'https://rpc.monad.xyz'),
  apiUrl: process.env.EXPO_PUBLIC_API_URL || (chainId === 10143 ? testnetHandoff.apiUrl : ''),
  ...serviceUrls(chainId, {
    gatewayUrl: process.env.EXPO_PUBLIC_GATEWAY_URL,
    envioUrl: process.env.EXPO_PUBLIC_ENVIO_URL,
    envioUrlPointer: process.env.EXPO_PUBLIC_ENVIO_URL_POINTER,
  }),
  rpId: process.env.EXPO_PUBLIC_PASSKEY_RP_ID || '',
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '',
};
export function requireConfiguredChain(requestChainId: number = config.chainId) {
  if (parseChainId(requestChainId) !== config.chainId)
    throw new Error(
      `This transaction is for another network. Expected ${config.networkName} (${config.chainId}).`,
    );
}
