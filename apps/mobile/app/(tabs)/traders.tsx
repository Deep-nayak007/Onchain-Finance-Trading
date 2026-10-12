import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Screen,
  Type,
  Label,
  Card,
  Row,
  Button,
  Loading,
  QueryError,
  Empty,
} from '../../components/ui';
import { TraderCard } from '../../components/TraderCard';
import { colors } from '../../theme';
import { envio } from '../../lib/envio';
import { useStatus } from '../../lib/queries';
import { config } from '../../lib/config';
export default function Traders() {
  const query = useQuery({
    queryKey: ['traders'],
    queryFn: () => envio.traderStats(),
    refetchInterval: 5000,
  });
  const status = useStatus();
  return (
    <Screen title="Hire a trader." subtitle="Three personalities. The same unbreakable rules.">
      <Card
        style={{
          gap: 9,
          marginBottom: 24,
          backgroundColor: `${colors.accent}08`,
          borderColor: `${colors.accent}30`,
        }}
      >
        <Label color={colors.accent}>Shadow first. Proof always.</Label>
        <Type color={colors.muted} style={{ fontSize: 12, lineHeight: 20 }}>
          Shadow traders publish decisions before the market moves. Their paper trail stays public,
          even when a call goes wrong.
        </Type>
      </Card>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <QueryError error={query.error} retry={() => void query.refetch()} />
      ) : !query.data?.length ? (
        <Empty
          title="No traders yet"
          description="Your team’s registered trader identities will appear here."
        />
      ) : (
        <View style={{ gap: 16 }}>
          {query.data.map((t) => (
            <View key={t.persona.id} style={{ gap: 9 }}>
              <TraderCard
                trader={t}
                selected={t.persona.id === status.data?.persona}
                onPress={() =>
                  router.push({ pathname: '/rules', params: { persona: t.persona.id } })
                }
              />
              {t.identityUrl && /^https:\/\//.test(t.identityUrl) ? (
                <Button
                  variant="ghost"
                  label={`View ${t.persona.name}’s ERC-8004 identity`}
                  icon="external"
                  onPress={() => void Linking.openURL(t.identityUrl!)}
                />
              ) : (
                <Type color={colors.muted} style={{ textAlign: 'center', fontSize: 10 }}>
                  {config.useMocks
                    ? 'Sample identity · registration pending'
                    : 'ERC-8004 identity link pending'}
                </Type>
              )}
            </View>
          ))}
        </View>
      )}
      <View style={{ marginTop: 28, gap: 8 }}>
        <Row style={{ justifyContent: 'center' }}>
          <Label>Receipts over screenshots.</Label>
        </Row>
        <Type color={colors.muted} style={{ fontSize: 10, lineHeight: 17, textAlign: 'center' }}>
          {config.useMocks
            ? 'Sample performance for the demo. No returns are promised.'
            : 'Performance comes from indexed fills. Past returns do not promise future returns.'}
        </Type>
      </View>
    </Screen>
  );
}
