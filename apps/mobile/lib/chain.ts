import { createPublicClient, http } from 'viem';
import { monad, monadTestnet } from 'viem/chains';
import { config } from './config';
export const activeChain = config.chainId === 10143 ? monadTestnet : monad;
export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(config.rpcUrl, { timeout: 15000 }),
});
export const explorerTxUrl = (hash: string) =>
  `${activeChain.blockExplorers!.default.url}/tx/${hash}`;
export const testnetClient = createPublicClient({ chain: monadTestnet, transport: http() });
