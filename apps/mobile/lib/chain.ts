import { createPublicClient, http } from 'viem';
import { monad, monadTestnet } from 'viem/chains';
import { config, isTestnet } from './config';
export const activeChain = isTestnet ? monadTestnet : monad;
export const publicClient = createPublicClient({ chain: activeChain, transport: http(config.rpcUrl) });
export const testnetClient = createPublicClient({ chain: monadTestnet, transport: http() });
