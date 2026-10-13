import assert from 'node:assert/strict';
import { decodeFunctionData, keccak256, parseEther, toBytes } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { canonicalJSON } from '@leash/shared/canonical';
import { mandateRegistryAbi } from '@leash/shared/abis';
import { testnetHandoff } from '../integration/testnet';

Object.assign(process.env, {
  EXPO_PUBLIC_USE_MOCKS: 'false',
  EXPO_PUBLIC_CHAIN_ID: '10143',
  EXPO_PUBLIC_RPC_URL: testnetHandoff.rpcUrl,
  EXPO_PUBLIC_API_URL: testnetHandoff.apiUrl,
});
async function main() {
  const [
    { api },
    { publicClient },
    { readReceiptProof },
    { verifyReceipt },
    { ServiceError },
    { liveBindings },
    { gateway, assertGatewayMarkets },
    { readIndexedReceipt },
  ] = await Promise.all([
    import('../lib/api'),
    import('../lib/chain'),
    import('../integration/receiptProof'),
    import('../lib/verify'),
    import('../lib/http'),
    import('../integration/live'),
    import('../lib/gateway'),
    import('../integration/indexer'),
  ]);
  const [health, configuration, detail, traders] = await Promise.all([
    api.health(),
    api.configuration(),
    api.receipt(testnetHandoff.reasonHash),
    api.traders(),
  ]);
  assert.equal(health.ok, true);
  assert.equal(health.chainId, 10143);
  assert.equal(health.live, false);
  assert.equal(configuration.chainId, 10143);
  assert.equal(await publicClient.getChainId(), 10143);
  assert.deepEqual(
    traders.map((p) => p.id),
    ['falcon', 'otter', 'owl'],
  );
  const [gatewayHealth, markets, book, risk, spot, indexed] = await Promise.all([
    gateway.health(),
    gateway.markets(),
    gateway.book('MON-PERP'),
    gateway.risk('0xE7f1FFcC13C1384a2a1d7eaC19edF0F69e85f4FD'),
    liveBindings.readSpotBook(),
    readIndexedReceipt(null, testnetHandoff.reasonHash),
  ]);
  assert.equal(gatewayHealth.ok, true);
  assertGatewayMarkets(markets, 10143);
  assert.ok(book.bids.length || book.asks.length);
  assert.equal(risk.account.toLowerCase(), '0xe7f1ffcc13c1384a2a1d7eac19edf0f69e85f4fd');
  assert.ok(spot.bids.length || spot.asks.length);
  assert.ok(indexed);
  console.log(`PASS: Render API + RPC chain 10143; paper mode; ${traders.length} personas.`);
  console.log(
    `PASS: shared testnet gateway; ${markets.length} markets; live MON-PERP book and account risk.`,
  );
  console.log(`PASS: Kuru SDK book; Envio indexed receipt #${indexed.seq}.`);
  const proof = await readReceiptProof(
    testnetHandoff.reasonHash,
    testnetHandoff.receiptTxHash,
    detail,
  );
  assert.equal(proof.reasonHash, indexed.reasonHash);
  assert.equal(proof.signalHash, indexed.signalHash);
  assert.equal(proof.execTxHash, null);
  assert.equal(proof.usedSlack, true);
  console.log(
    'PASS: indexed anchors agree with the confirmed ReceiptLog transaction; paper + usedSlack.',
  );
  if (!detail) {
    console.error(
      'BLOCKED: Brain returned 404 for receipt reasoning. Onchain metadata is available; full hash verification and latency cannot be checked. Ask Brain to restore its receipt data.',
    );
    process.exitCode = 2;
    return;
  }
  assert.equal(detail.execTxHash, null);
  assert.equal(detail.decision.usedSlack, true);
  const verification = verifyReceipt(detail, proof, false);
  assert.equal(verification.state, 'verified');
  assert.equal(verification.latencyMs, 886);
  assert.equal(
    verifyReceipt({ ...detail, intent: { ...detail.intent, sizeUsd: '999' } }, proof, false).state,
    'mismatch',
  );
  assert.equal(
    verifyReceipt(detail, { reasonHash: null, signalHash: null }, false).state,
    'pending',
  );
  console.log(
    `PASS: independent ReceiptLog proof; usedSlack; ${verification.latencyMs} ms; tampering rejected.`,
  );

  // Optional integration exercise: an ephemeral wallet, test MON only, no user signature or venue order.
  if (process.argv.includes('--exercise-wallet')) {
    const account = privateKeyToAccount(generatePrivateKey()).address;
    const drip = await api.drip(account);
    assert.ok(drip);
    assert.equal(drip.amountMon, '0.2');
    assert.equal(
      (await publicClient.getTransactionReceipt({ hash: drip.txHash as `0x${string}` })).status,
      'success',
    );
    assert.equal(await publicClient.getBalance({ address: account }), parseEther('0.2'));
    await assert.rejects(
      api.drip(account),
      (error: unknown) => error instanceof ServiceError && error.status === 409,
    );
    console.log(
      `PASS: {account} receives 0.2 test MON once; repeat returns 409. Account: ${account}. Tx: ${drip.txHash}`,
    );
    const compiled = await api.compile(
      account,
      'Trade MON-PERP only, up to 1x leverage and $10 per trade. Stop at 5% weekly loss. Do not require smart money.',
      'falcon',
    );
    assert.equal(keccak256(toBytes(canonicalJSON(compiled.policy))), compiled.policyHash);
    assert.ok(compiled.agentWallet);
    assert.ok(compiled.perplKey);
    const prepared = await liveBindings.prepareMandate(account, compiled, 'falcon');
    assert.equal(prepared.chainId, 10143);
    assert.ok(BigInt(prepared.gas) > 0n);
    assert.equal(
      decodeFunctionData({ abi: mandateRegistryAbi, data: prepared.data as `0x${string}` })
        .functionName,
      'setMandate',
    );
    console.log(
      'PASS: cloud rule compilation, exact policy hash, wallet/key fields, unsigned setMandate with explicit gas.',
    );
    const quote = await liveBindings.quoteSwap(account, '1', 'BUY');
    assert.ok(Number(quote.minOut) > 0 && Number(quote.minOut) <= Number(quote.amountOut));
    assert.ok(quote.transactions.every((tx) => tx.chainId === 10143 && BigInt(tx.gas) > 0n));
    console.log(
      'PASS: cloud Kuru BUY quote, nonzero minimum output, unsigned testnet transactions. No swap sent.',
    );
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
