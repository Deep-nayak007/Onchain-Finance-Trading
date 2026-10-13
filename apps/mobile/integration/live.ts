import { z } from 'zod';
import {
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from 'viem';
import { leverageToX10, toUsd6 } from '@leash/shared';
import { PERPL, PERPL_TESTNET } from '@leash/shared/addresses';
import { mandateRegistryAbi } from '@leash/shared/abis';
import { prepareTxRequest, sendTx } from '@leash/shared/sendTx';
import { canonicalJSON } from '@leash/shared/canonical';
import { api } from '../lib/api';
import { config, requireConfiguredChain } from '../lib/config';
import { activeChain, publicClient } from '../lib/chain';
import { request, ServiceError } from '../lib/http';
import { compiledPolicy, rememberPolicy } from '../lib/compiledPolicies';
import { gateway, requestGateway, keyPrepareSchema, spotBookSchema } from '../lib/gateway';
import { spotPrepareSchema, txRequestSchema } from '../lib/schemas';
import { readIndexedFeed, readIndexedPnl, readIndexedReceipt } from './indexer';
import { readReceiptProof } from './receiptProof';
import { testnetHandoff } from './testnet';
import { registryAddress } from '../lib/mandate';
import type { TeamBindings } from './team';

async function backendRegistry(): Promise<Address> {
  const backend = await api.configuration();
  requireConfiguredChain(backend.chainId);
  const address = await registryAddress();
  if (backend.addresses?.mandateRegistry.toLowerCase() !== address.toLowerCase())
    throw new Error('The API and app disagree about the deployed registry.');
  return address;
}
async function prepareRegistry(account: Address, data: Hex, needsBackend = true) {
  return txRequestSchema.parse(
    await prepareTxRequest(
      publicClient,
      account,
      { to: await (needsBackend ? backendRegistry() : registryAddress()), data },
      { chainId: config.chainId },
    ),
  );
}
export const liveBindings: TeamBindings = {
  sendTx: async (account, prepared) => {
    const tx = txRequestSchema.parse(prepared);
    requireConfiguredChain(tx.chainId);
    requireConfiguredChain(await publicClient.getChainId());
    const wallet = createWalletClient({
      account,
      chain: activeChain,
      transport: http(config.rpcUrl),
    });
    return (
      await sendTx(
        wallet,
        publicClient,
        {
          to: tx.to as Address,
          data: tx.data as Hex,
          value: BigInt(tx.value),
          gas: BigInt(tx.gas),
        },
        { chainId: config.chainId },
      )
    ).hash;
  },
  prepareMandate: async (account, compiled, _persona) => {
    if (!compiled.agentWallet || !compiled.perplKey)
      throw new Error(
        'The trader wallet or Perpl key is unavailable. Resolve the warnings and compile again before signing.',
      );
    const policyHash = keccak256(toBytes(canonicalJSON(compiled.policy)));
    if (policyHash.toLowerCase() !== compiled.policyHash.toLowerCase())
      throw new Error('The policy fingerprint does not match the reviewed rules.');
    return prepareRegistry(
      account,
      encodeFunctionData({
        abi: mandateRegistryAbi,
        functionName: 'setMandate',
        args: [
          {
            policyHash,
            maxNotionalUsd6: toUsd6(compiled.policy.maxNotionalUsd),
            maxLeverageX10: leverageToX10(compiled.policy.maxLeverage),
            maxWeeklyLossBps: Math.round(compiled.policy.maxWeeklyLossPct * 100),
            agentId: BigInt(compiled.agentId),
            agentWallet: compiled.agentWallet as Address,
            perplKey: compiled.perplKey as Address,
            paused: false,
            updatedAt: 0n,
          },
        ],
      }),
    );
  },
  prepareSlack: async (account, slack) => {
    if (
      slack.account.toLowerCase() !== account.toLowerCase() ||
      slack.status !== 'PENDING' ||
      Date.parse(slack.expiresAt) <= Date.now()
    )
      throw new Error('This slack request is expired or belongs to another wallet.');
    return prepareRegistry(
      account,
      encodeFunctionData({
        abi: mandateRegistryAbi,
        functionName: 'grantSlack',
        args: [
          {
            maxLeverageX10: leverageToX10(slack.requested.maxLeverage),
            maxNotionalUsd6: toUsd6(slack.requested.maxNotionalUsd),
            extraRiskUsd6: toUsd6(slack.requested.extraRiskUsd),
            expiresAt: BigInt(Math.floor(Date.now() / 1000) + slack.requested.durationSec),
          },
        ],
      }),
    );
  },
  preparePause: (account) =>
    prepareRegistry(
      account,
      encodeFunctionData({
        abi: mandateRegistryAbi,
        functionName: 'pause',
        args: [account, 'user'],
      }),
      false, // A user can pause directly onchain even when the Brain API is down.
    ),
  prepareResume: (account) =>
    prepareRegistry(
      account,
      encodeFunctionData({ abi: mandateRegistryAbi, functionName: 'resume' }),
    ),
  activateAgent: async (account, _persona, txHash) => {
    await api.activate({ account, txHash });
  },
  resumeAgent: async (account, txHash) => {
    await api.activate({ account, txHash });
  },
  readReceipts: readIndexedFeed,
  readReceipt: async (account, hash, proofTxHash) => {
    const knownTx =
      config.chainId === 10143 && hash.toLowerCase() === testnetHandoff.reasonHash
        ? testnetHandoff.receiptTxHash
        : undefined;
    const tx = proofTxHash ?? knownTx;
    if (config.envioUrl || config.envioUrlPointer) {
      try {
        const indexed = await readIndexedReceipt(account, hash);
        if (indexed || !tx) return indexed;
      } catch (error) {
        if (!tx) throw error;
        // A bounded, explicit ReceiptLog transaction remains an independent proof.
      }
    }
    if (!tx) return null;
    const detail = await api.receipt(hash);
    const proof = await readReceiptProof(hash, tx, detail);
    if (account && proof.account?.toLowerCase() !== account.toLowerCase())
      throw new Error('This receipt belongs to another wallet.');
    return proof;
  },
  readPnl: async (account) => {
    const mandate = await publicClient.readContract({
      address: await registryAddress(),
      abi: mandateRegistryAbi,
      functionName: 'getMandate',
      args: [account],
    });
    return readIndexedPnl(String(mandate.agentId));
  },
  readTraderStats: async () => {
    const traders = await api.traders();
    // /traders has no seven-day return calculation. Unavailable performance stays blank.
    return traders.map((persona) => ({
      persona,
      sevenDayPct: null,
      receipts: persona.stats
        ? persona.stats.executedCount + persona.stats.rejectedCount + persona.stats.shadowCount
        : null,
      maxDrawdownPct: persona.stats?.maxDrawdownPct ?? null,
    }));
  },
  readPolicy: async (account) => {
    const mandate = await publicClient.readContract({
      address: await registryAddress(),
      abi: mandateRegistryAbi,
      functionName: 'getMandate',
      args: [account],
    });
    const cached = compiledPolicy(account, mandate.policyHash);
    if (cached) return cached;
    const result = await api.policy(account);
    if (!result) return null;
    const hash = keccak256(toBytes(canonicalJSON(result.policy)));
    if (
      hash.toLowerCase() !== result.policyHash.toLowerCase() ||
      hash.toLowerCase() !== mandate.policyHash.toLowerCase()
    )
      throw new Error('The stored rules do not match your onchain mandate.');
    rememberPolicy(account, hash, result.policy);
    return result.policy;
  },
  readBalanceUsd: async (account) => {
    requireConfiguredChain(await publicClient.getChainId());
    const address = (config.chainId === 10143 ? PERPL_TESTNET : PERPL).collateralToken;
    const [balance, decimals] = await Promise.all([
      publicClient.readContract({
        address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account],
      }),
      publicClient.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    if (decimals !== 6)
      throw new Error('The collateral token decimals differ from the shared specification.');
    return formatUnits(balance, decimals);
  },
  prepareDeposit: async (account, amountUsd) => {
    let txs;
    try {
      txs = await requestGateway('/deposit/prepare', z.array(txRequestSchema).min(1), {
        account,
        amountUsd,
      });
    } catch (error) {
      if (
        config.chainId === 10143 &&
        error instanceof ServiceError &&
        error.status === 400 &&
        error.message.includes('deposit/prepare wired at CP2')
      )
        throw new Error(
          'Perpl testnet deposits are not available yet. In paper mode, continue to Write my rules without depositing.',
        );
      throw error;
    }
    txs.forEach((tx) => requireConfiguredChain(tx.chainId));
    return txs;
  },
  prepareKeyEnrollment: async (account) => {
    const result = await requestGateway('/keys/prepare', keyPrepareSchema, { account });
    if (!result.enrollment)
      throw new Error(
        'The trading key was created, but Perpl authorization is not available yet. Your trader has not been authorized.',
      );
    requireConfiguredChain(result.enrollment.chainId);
    return [result.enrollment];
  },
  prepareManualOrder: async (account, market, side, sizeUsd, leverage) => {
    const book = await gateway.book(market);
    const price = (side === 'LONG' ? book.asks : book.bids)[0]?.[0];
    if (!price) throw new Error('There is no market depth for this order.');
    const tx = await requestGateway('/orders/prepare', txRequestSchema, {
      account,
      market,
      side,
      sizeUsd,
      price,
      leverage,
      reduce_only: false,
    });
    requireConfiguredChain(tx.chainId);
    return tx;
  },
  readSpotBook: async () => {
    requireConfiguredChain((await api.health()).chainId);
    return request(config.apiUrl, '/spot/book', spotBookSchema);
  },
  quoteSwap: async (account, sizeUsd, side) => {
    requireConfiguredChain((await api.health()).chainId);
    const result = await request(config.apiUrl, '/spot/prepare', spotPrepareSchema, {
      account,
      side,
      sizeUsd,
    });
    result.txs.forEach((tx) => requireConfiguredChain(tx.chainId));
    return {
      amountOut: String(result.estimatedOut),
      minOut: String(result.minOut),
      expiresAt: Date.now() + 30000,
      transactions: result.txs,
    };
  },
};
