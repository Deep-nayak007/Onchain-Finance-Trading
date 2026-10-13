import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Screen,
  Card,
  Row,
  Type,
  Label,
  Button,
  Message,
  SectionTitle,
  Loading,
  QueryError,
  Empty,
} from '../components/ui';
import { ReceiptPaper } from '../components/ReceiptPaper';
import { PersonaMark } from '../components/Icon';
import { colors } from '../theme';
import { config, requireConfiguredChain } from '../lib/config';
import { api } from '../lib/api';
import { gateway } from '../lib/gateway';
import { liveBindings } from '../integration/live';
import { readIndexedFeed, readIndexedTraderFeed } from '../integration/indexer';
import { testnetHandoff } from '../integration/testnet';
import { dollars } from '../lib/money';
import type { Address } from 'viem';

export default function LiveDemo() {
  const [selected, setSelected] = useState('demo');
  const enabled = !config.useMocks && config.chainId === 10143;
  const traders = useQuery({
    queryKey: ['live-demo-traders'],
    enabled,
    queryFn: async () => {
      requireConfiguredChain((await api.health()).chainId);
      return api.traders();
    },
    refetchInterval: 15000,
  });
  const selectedTrader = traders.data?.find((p) => p.id === selected);
  const account = selected === 'demo' ? testnetHandoff.account : null;
  const receipts = useQuery({
    queryKey: ['live-demo-receipts', selected, selectedTrader?.agentId],
    enabled: enabled && (!!account || !!selectedTrader?.agentId),
    queryFn: () =>
      account
        ? readIndexedFeed(account as Address, { limit: 10, includeDetails: false })
        : readIndexedTraderFeed(selectedTrader!.agentId),
    refetchInterval: 15000,
  });
  const risk = useQuery({
    queryKey: ['live-demo-risk'],
    enabled,
    queryFn: () => gateway.risk(testnetHandoff.account),
    refetchInterval: 10000,
  });
  const status = useQuery({
    queryKey: ['live-demo-status'],
    enabled,
    queryFn: () => api.status(testnetHandoff.account),
    refetchInterval: 15000,
  });
  const perpl = useQuery({
    queryKey: ['perpl-book'],
    enabled,
    queryFn: () => gateway.book('MON-PERP'),
    refetchInterval: 10000,
  });
  const spot = useQuery({
    queryKey: ['spot-book'],
    enabled,
    queryFn: liveBindings.readSpotBook,
    refetchInterval: 10000,
  });
  return (
    <Screen
      back
      title="See the leash in action."
      subtitle="Public testnet data. Your own wallet when you’re ready."
    >
      {!enabled ? (
        <Message text="Open the live Monad testnet profile to use this demo." tone="info" />
      ) : (
        <>
          <Message
            text="You are viewing the team’s public demo account and persona wallets. These are real service responses and onchain records. This screen does not sign in or control those wallets."
            tone="info"
          />
          <SectionTitle title="Live markets" />
          <Card style={{ gap: 12 }}>
            <Label>Perpl · MON-PERP</Label>
            {perpl.isPending ? (
              <Loading />
            ) : perpl.error ? (
              <QueryError error={perpl.error} retry={() => void perpl.refetch()} />
            ) : (
              <>
                <Type>Best bid ${perpl.data?.bids[0]?.[0] ?? '—'}</Type>
                <Type>Best ask ${perpl.data?.asks[0]?.[0] ?? '—'}</Type>
              </>
            )}
            <Label>Kuru · MON / test USDC</Label>
            {spot.isPending ? (
              <Loading />
            ) : spot.error ? (
              <QueryError error={spot.error} retry={() => void spot.refetch()} />
            ) : (
              <>
                <Type>
                  {spot.data?.bids.length} bids · {spot.data?.asks.length} asks
                </Type>
                <Type color={colors.muted}>
                  {spot.data?.bids.length
                    ? 'Sell-side liquidity available.'
                    : 'No buyers right now. Sell quotes are unavailable.'}
                </Type>
              </>
            )}
          </Card>
          <SectionTitle title="Demo account risk" />
          {risk.isPending ? (
            <Loading />
          ) : risk.error ? (
            <QueryError error={risk.error} retry={() => void risk.refetch()} />
          ) : (
            <Card style={{ gap: 10 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Label>Perpl equity</Label>
                <Type>{dollars(risk.data?.equityUsd ?? '0')}</Type>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Label>Open positions</Label>
                <Type>{risk.data?.positions.length}</Type>
              </Row>
              <Type color={colors.muted}>
                Paper decisions do not create funded exchange positions.
              </Type>
              {status.error ? (
                <QueryError error={status.error} retry={() => void status.refetch()} />
              ) : (
                <Type color={colors.rope}>
                  {status.data?.state === 'RECOVERY_REQUIRED'
                    ? 'The demo trader needs its owner to reconnect after a Brain restart.'
                    : status.data?.state === 'PAUSED'
                      ? 'The demo trader is paused onchain.'
                      : status.data?.state === 'NOT_STARTED'
                        ? 'No mandate is signed for this demo account.'
                        : `Demo trader: ${status.data?.state ?? 'checking…'}`}
                </Type>
              )}
            </Card>
          )}
          <SectionTitle title="Three traders" />
          {traders.isPending ? (
            <Loading />
          ) : traders.error ? (
            <QueryError error={traders.error} retry={() => void traders.refetch()} />
          ) : (
            <View style={{ gap: 12 }}>
              {traders.data?.map((p) => (
                <Card key={p.id} style={{ gap: 10 }}>
                  <Row>
                    <PersonaMark persona={p.id} size={35} />
                    <Type kind="display" style={{ fontSize: 24 }}>
                      {p.name}
                    </Type>
                  </Row>
                  <Type color={colors.muted}>{p.style}</Type>
                  <Label>
                    ERC-8004 #{p.agentId} · {p.mode === 'SHADOW' ? 'shadow' : 'paper trader'}
                  </Label>
                  <Type>
                    {p.stats
                      ? `${p.stats.executedCount} executed · ${p.stats.rejectedCount} blocked · ${p.stats.shadowCount} shadow`
                      : 'No indexed performance available.'}
                  </Type>
                  <Button
                    variant="secondary"
                    label={`View ${p.name}’s receipts`}
                    disabled={!/^[1-9]\d*$/.test(p.agentId)}
                    onPress={() => setSelected(p.id)}
                  />
                </Card>
              ))}
            </View>
          )}
          <SectionTitle
            title={selected === 'demo' ? 'Demo account receipts' : `${selected} receipts`}
          />
          <Button
            variant="ghost"
            label="View demo account receipts"
            onPress={() => setSelected('demo')}
          />
          <Type
            selectable
            kind="mono"
            color={colors.muted}
            style={{ marginVertical: 10, letterSpacing: 0 }}
          >
            {account ?? `ERC-8004 #${selectedTrader?.agentId ?? '—'} · public decisions`}
          </Type>
          {receipts.isPending ? (
            <Loading />
          ) : receipts.error ? (
            <QueryError error={receipts.error} retry={() => void receipts.refetch()} />
          ) : !receipts.data?.length ? (
            <Empty
              title="No indexed receipts"
              description="Published decisions appear here when the indexer catches up."
            />
          ) : (
            <View style={{ gap: 12 }}>
              {receipts.data.map((r) => (
                <ReceiptPaper
                  key={r.id}
                  receipt={r}
                  compact
                  onPress={() => {
                    if (r.reasonHash)
                      router.push({
                        pathname: '/receipt/[hash]',
                        params: { hash: r.reasonHash, proofTxHash: r.proofTxHash },
                      });
                  }}
                />
              ))}
            </View>
          )}
          <Type color={colors.muted} style={{ marginTop: 12, fontSize: 12, lineHeight: 20 }}>
            Open a receipt to fetch its reasoning and check the hashes. Missing reasoning stays
            unverified; a paper receipt means no venue trade was executed.
          </Type>
          <Button
            variant="secondary"
            label="Open published paper receipt"
            icon="receipt"
            onPress={() =>
              router.push({
                pathname: '/receipt/[hash]',
                params: {
                  hash: testnetHandoff.reasonHash,
                  proofTxHash: testnetHandoff.receiptTxHash,
                },
              })
            }
          />
          <SectionTitle title="Use your own trader" />
          <Card style={{ gap: 14 }}>
            <Type>1. Create or restore your passkey wallet.</Type>
            <Type>2. Cover your testnet gas, choose a trader and compile your rules.</Type>
            <Type>3. Review and sign your onchain mandate to start paper trading.</Type>
            <Type>
              4. Read decisions, approve available slack requests, or pause and resume with your
              signature.
            </Type>
            <Type color={colors.muted}>
              Perpl deposits and exchange enrollment are unfinished in the gateway. Real swaps need
              test USDC or MON and available liquidity. Paper mode never promises a live fill.
            </Type>
            <Button
              label="Set up my own trader"
              icon="face"
              onPress={() => router.push('/welcome')}
            />
          </Card>
          <Button
            variant="secondary"
            label="Check live connections"
            onPress={() => router.push('/dev/services')}
          />
          <Button
            variant="ghost"
            label="Try to break the leash"
            onPress={() => router.push('/break-leash')}
          />
        </>
      )}
    </Screen>
  );
}
