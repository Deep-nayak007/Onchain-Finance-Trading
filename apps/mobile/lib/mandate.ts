import { zeroHash, type Address } from 'viem';
import { LEASH } from '@leash/shared/addresses';
import { mandateRegistryAbi } from '@leash/shared/abis';
import { config, requireConfiguredChain } from './config';
import { publicClient } from './chain';
export async function registryAddress(): Promise<Address> {
  requireConfiguredChain(await publicClient.getChainId());
  const deployment = config.chainId === 10143 ? LEASH.testnet : LEASH.mainnet;
  if (!deployment.mandateRegistry.address)
    throw new Error('MandateRegistry is not deployed on this network.');
  const address = deployment.mandateRegistry.address;
  const bytecode = await publicClient.getBytecode({ address });
  if (!bytecode || bytecode === '0x') throw new Error('The registry has no deployed code.');
  return address;
}
export async function readMandate(account: Address) {
  const mandate = await publicClient.readContract({
    address: await registryAddress(),
    abi: mandateRegistryAbi,
    functionName: 'getMandate',
    args: [account],
  });
  return mandate.policyHash === zeroHash ? null : mandate;
}
