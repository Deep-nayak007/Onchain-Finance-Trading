import { SERVICES } from '@leash/shared/addresses';

// Rails owns these URLs. The shared Envio deployment indexes testnet only.
export function serviceUrls(
  chainId: 143 | 10143,
  overrides: { gatewayUrl?: string; envioUrl?: string; envioUrlPointer?: string } = {},
) {
  const gatewayUrl =
    overrides.gatewayUrl ||
    (chainId === 10143 ? SERVICES.gatewayUrl : SERVICES.gatewayUrlMainnet) ||
    '';
  const otherGateway = chainId === 10143 ? SERVICES.gatewayUrlMainnet : SERVICES.gatewayUrl;
  if (otherGateway && gatewayUrl.replace(/\/$/, '') === otherGateway.replace(/\/$/, ''))
    throw new Error(
      'The Perpl gateway URL belongs to another network. Check EXPO_PUBLIC_CHAIN_ID.',
    );
  return {
    gatewayUrl,
    envioUrl: overrides.envioUrl || (chainId === 10143 ? SERVICES.envioUrl : '') || '',
    envioUrlPointer:
      overrides.envioUrlPointer || (chainId === 10143 ? SERVICES.envioUrlPointer : ''),
  };
}
