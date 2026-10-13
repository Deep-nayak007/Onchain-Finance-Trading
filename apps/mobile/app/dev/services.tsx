import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  Screen,
  Card,
  Label,
  Type,
  Message,
  Loading,
  QueryError,
  Button,
} from '../../components/ui';
import { colors } from '../../theme';
import { config, requireConfiguredChain } from '../../lib/config';
import { api } from '../../lib/api';
import { gateway, assertGatewayMarkets } from '../../lib/gateway';
import { publicClient } from '../../lib/chain';
import { liveBindings } from '../../integration/live';
import { readIndexedReceipt } from '../../integration/indexer';
import { testnetHandoff } from '../../integration/testnet';

export default function Services() {
  const enabled = !config.useMocks;
  const brain = useQuery({
    queryKey: ['connection-brain'],
    enabled,
    queryFn: async () => {
      const result = await api.health();
      requireConfiguredChain(result.chainId);
      return result;
    },
  });
  const rpc = useQuery({
    queryKey: ['connection-rpc'],
    enabled,
    queryFn: async () => {
      const id = await publicClient.getChainId();
      requireConfiguredChain(id);
      return id;
    },
  });
  const perpl = useQuery({
    queryKey: ['connection-perpl'],
    enabled,
    queryFn: async () => {
      const [health, markets, book] = await Promise.all([
        gateway.health(),
        gateway.markets(),
        gateway.book('MON-PERP'),
      ]);
      assertGatewayMarkets(markets, config.chainId);
      return { health, markets, book };
    },
  });
  const kuru = useQuery({
    queryKey: ['connection-kuru'],
    enabled,
    queryFn: liveBindings.readSpotBook,
  });
  const history = useQuery({
    queryKey: ['connection-envio'],
    enabled: enabled && config.chainId === 10143,
    queryFn: () => readIndexedReceipt(null, testnetHandoff.reasonHash),
  });
  const refresh = () => {
    for (const query of [brain, rpc, perpl, kuru, history]) void query.refetch();
  };
  return (
    <Screen
      back
      title="Check the connections."
      subtitle={`${config.networkName} · ${config.chainId}`}
    >
      {config.useMocks ? (
        <Message
          text="This is sample mode. Open the testnet profile to check live services."
          tone="info"
        />
      ) : (
        <>
          <Message
            text="Read-only checks. No wallet, signature or deposit is needed. Sleeping services can take about a minute to start."
            tone="info"
          />
          <View style={{ gap: 14 }}>
            <Card style={{ gap: 10 }}>
              <Label>Brain API</Label>
              {brain.isPending ? (
                <Loading label="Connecting to Brain…" />
              ) : brain.error ? (
                <QueryError error={brain.error} retry={() => void brain.refetch()} />
              ) : (
                <Type color={brain.data?.ok ? colors.ok : colors.bad}>
                  {brain.data?.ok ? 'Brain connected' : 'Brain unavailable'} ·{' '}
                  {brain.data?.live ? 'live orders' : 'paper mode'}
                </Type>
              )}
              {rpc.isPending ? (
                <Loading label="Checking the chain…" />
              ) : rpc.error ? (
                <QueryError error={rpc.error} retry={() => void rpc.refetch()} />
              ) : (
                <Type>RPC matches · {rpc.data}</Type>
              )}
            </Card>
            <Card style={{ gap: 10 }}>
              <Label>Perpl gateway</Label>
              {perpl.isPending ? (
                <Loading label="Waking the trading service…" />
              ) : perpl.error ? (
                <QueryError error={perpl.error} retry={() => void perpl.refetch()} />
              ) : (
                <>
                  <Type color={colors.ok}>
                    Perpl connected · {perpl.data?.markets.length} markets
                  </Type>
                  <Type>MON-PERP · network matches</Type>
                  <Type>Best bid ${perpl.data?.book.bids[0]?.[0] ?? '—'}</Type>
                  <Type>Best ask ${perpl.data?.book.asks[0]?.[0] ?? '—'}</Type>
                  <Type color={colors.muted}>
                    Cache lag · {perpl.data?.health.cacheLagBlocks} blocks
                  </Type>
                </>
              )}
            </Card>
            <Card style={{ gap: 10 }}>
              <Label>Kuru spot book</Label>
              {kuru.isPending ? (
                <Loading label="Loading the spot book…" />
              ) : kuru.error ? (
                <QueryError error={kuru.error} retry={() => void kuru.refetch()} />
              ) : (
                <>
                  <Type color={colors.ok}>Kuru book connected</Type>
                  <Type>
                    {kuru.data?.bids.length} bids · {kuru.data?.asks.length} asks
                  </Type>
                </>
              )}
            </Card>
            {config.chainId === 10143 && (
              <Card style={{ gap: 10 }}>
                <Label>Envio receipt history</Label>
                {history.isPending ? (
                  <Loading label="Finding the receipt…" />
                ) : history.error ? (
                  <QueryError error={history.error} retry={() => void history.refetch()} />
                ) : history.data ? (
                  <>
                    <Type color={colors.ok}>Envio connected · receipt #{history.data.seq}</Type>
                    <Type color={colors.muted}>
                      {history.data.detail
                        ? 'Reasoning is available. Open the receipt to verify its fingerprint.'
                        : 'Onchain record found. Brain reasoning is missing; verification is pending.'}
                    </Type>
                  </>
                ) : (
                  <Type>No indexed receipt found.</Type>
                )}
              </Card>
            )}
          </View>
          <Button label="Refresh connections" variant="secondary" onPress={refresh} />
        </>
      )}
    </Screen>
  );
}
