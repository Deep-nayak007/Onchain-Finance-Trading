import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  Screen,
  Label,
  Type,
  Card,
  Row,
  Pill,
  SectionTitle,
  Loading,
  QueryError,
  Empty,
  Message,
} from '../../components/ui';
import { Sparkline } from '../../components/Sparkline';
import { colors } from '../../theme';
import { useRisk, usePolicy } from '../../lib/queries';
import { useSession } from '../../lib/session';
import { envio } from '../../lib/envio';
import { dollars, percent } from '../../lib/money';
export default function Risk() {
  const query = useRisk(),
    policy = usePolicy();
  const { account } = useSession();
  const pnl = useQuery({
    queryKey: ['pnl', account],
    queryFn: () => envio.pnl(account!),
    enabled: !!account,
    refetchInterval: 4000,
  });
  const r = query.data;
  const limit = policy.data?.maxWeeklyLossPct;
  const loss = r ? Math.max(0, -r.weeklyPnlPct) : 0;
  const totalExposure = r
    ? Object.values(r.exposureByMarket).reduce((a, v) => a + Number(v), 0)
    : 0;
  return (
    <Screen title="Room to breathe." subtitle="Know the risk before your trader takes it.">
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <QueryError error={query.error} retry={() => void query.refetch()} />
      ) : (
        r && (
          <>
            <Card style={{ gap: 13 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Label>Account equity</Label>
                <Pill label="REFRESH · 4S" color={colors.muted} />
              </Row>
              <Type kind="display" style={{ fontSize: 40 }}>
                {dollars(r.equityUsd)}
              </Type>
              {pnl.isPending ? (
                <Loading />
              ) : pnl.error ? (
                <QueryError error={pnl.error} retry={() => void pnl.refetch()} />
              ) : pnl.data?.length ? (
                <Sparkline values={pnl.data} />
              ) : (
                <Type color={colors.muted} style={{ fontSize: 12 }}>
                  Your P&L curve starts after the first trade.
                </Type>
              )}
              <Row style={{ justifyContent: 'space-between' }}>
                <Label>Last 7 days</Label>
                <Type color={r.weeklyPnlPct >= 0 ? colors.ok : colors.bad}>
                  {percent(r.weeklyPnlPct, true)}
                </Type>
              </Row>
            </Card>
            {Date.now() - Date.parse(r.ts) > 15000 && (
              <Message
                tone="info"
                text="This risk snapshot is stale. New trades should wait for fresh data."
              />
            )}
            <SectionTitle title="Open positions" />
            {r.positions.length === 0 ? (
              <Empty
                title="No open positions"
                description="Your trader’s positions and liquidation distances will appear here."
              />
            ) : (
              r.positions.map((p, i) => (
                <Card key={`${p.market}-${i}`} style={{ gap: 14, marginBottom: 10 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Type kind="display" style={{ fontSize: 24 }}>
                      {p.market}
                    </Type>
                    <Pill label={p.side} color={p.side === 'LONG' ? colors.ok : colors.bad} />
                  </Row>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ gap: 5 }}>
                      <Label>Size</Label>
                      <Type>{dollars(p.sizeUsd)}</Type>
                    </View>
                    <View style={{ gap: 5, alignItems: 'flex-end' }}>
                      <Label>Unrealized</Label>
                      <Type color={Number(p.unrealizedPnlUsd) >= 0 ? colors.ok : colors.bad}>
                        {dollars(p.unrealizedPnlUsd)}
                      </Type>
                    </View>
                  </Row>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Label>Distance from liquidation</Label>
                    <Type kind="mono" color={p.liqDistancePct >= 10 ? colors.ok : colors.bad}>
                      {percent(p.liqDistancePct)}
                    </Type>
                  </Row>
                  <View style={{ height: 5, backgroundColor: colors.line, borderRadius: 4 }}>
                    <View
                      style={{
                        height: 5,
                        width: `${Math.max(0, Math.min(100, p.liqDistancePct))}%`,
                        backgroundColor: p.liqDistancePct >= 10 ? colors.ok : colors.bad,
                        borderRadius: 4,
                      }}
                    />
                  </View>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Type color={colors.muted} style={{ fontSize: 10 }}>
                      Entry ${p.entryPrice}
                    </Type>
                    <Type color={colors.muted} style={{ fontSize: 10 }}>
                      Liquidation ${p.liqPrice}
                    </Type>
                  </Row>
                </Card>
              ))
            )}
            <SectionTitle title="Your weekly loss limit" />
            <Card style={{ gap: 14 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Type kind="display" style={{ fontSize: 28 }}>
                  {percent(loss)}{' '}
                  <Type color={colors.muted}>/ {limit === undefined ? '—' : percent(limit)}</Type>
                </Type>
                <Pill
                  label={limit !== undefined && loss >= limit ? 'LIMIT REACHED' : 'WITHIN RULES'}
                  color={limit !== undefined && loss >= limit ? colors.bad : colors.ok}
                />
              </Row>
              <View style={{ height: 6, backgroundColor: colors.line, borderRadius: 3 }}>
                <View
                  style={{
                    height: 6,
                    width: `${limit ? Math.min(100, (loss / limit) * 100) : 0}%`,
                    backgroundColor: colors.rope,
                    borderRadius: 3,
                  }}
                />
              </View>
              <Type color={colors.muted} style={{ fontSize: 11, lineHeight: 18 }}>
                The Referee can pause trading independently when a limit is breached.
              </Type>
            </Card>
            <SectionTitle title="Exposure & funding" />
            <Card style={{ gap: 18 }}>
              {Object.entries(r.exposureByMarket).map(([market, value]) => (
                <View key={market} style={{ gap: 9 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Type style={{ fontSize: 12 }}>{market}</Type>
                    <Type kind="mono" style={{ fontSize: 11 }}>
                      {dollars(value)}
                    </Type>
                  </Row>
                  <View style={{ height: 4, backgroundColor: colors.line }}>
                    <View
                      style={{
                        height: 4,
                        width: `${totalExposure ? (Number(value) / totalExposure) * 100 : 0}%`,
                        backgroundColor: colors.accent,
                      }}
                    />
                  </View>
                </View>
              ))}
              <Row style={{ justifyContent: 'space-between' }}>
                <Label>Margin in use</Label>
                <Type>{dollars(r.marginUsedUsd)}</Type>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Label>Funding paid</Label>
                <Type>{dollars(r.fundingPaidUsd)}</Type>
              </Row>
            </Card>
          </>
        )
      )}
    </Screen>
  );
}
