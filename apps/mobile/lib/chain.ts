import { createPublicClient, http } from 'viem';
import { monad, monadTestnet } from 'viem/chains';
import { config } from './config';
export const publicClient = createPublicClient({ chain: monad, transport: http(config.rpcUrl) });
export const testnetClient = createPublicClient({ chain: monadTestnet, transport: http() });
