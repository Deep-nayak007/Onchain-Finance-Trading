import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Screen,
  Row,
  Label,
  Type,
  Card,
  Pill,
  Button,
  Message,
  Loading,
  QueryError,
} from '../../components/ui';
import { PersonaMark } from '../../components/Icon';
import { WhyChip } from '../../components/WhyChip';
import { colors } from '../../theme';
import { useSlack, useStatus } from '../../lib/queries';
import { useSession } from '../../lib/session';
import { useAction } from '../../lib/useAction';
import { approveSlack, retryConfirmedCallback } from '../../lib/actions';
import { api } from '../../lib/api';
import { config } from '../../lib/config';
export default function SlackSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { account } = useSession();
  const query = useSlack(),
    status = useStatus();
  const action = useAction();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const request = query.data?.find(
    (r) => r.id === id && r.account.toLowerCase() === account?.toLowerCase(),
  );
  const expires = request ? Date.parse(request.expiresAt) : 0;
  const secondsLeft = Math.max(0, Math.ceil((expires - now) / 1000));
  const canApprove =
    !!request && secondsLeft > 0 && request.status === 'PENDING' && status.data?.state !== 'PAUSED';
  return (
    <Screen back title="A little more leash?" subtitle="Your trader can ask. Only you can say yes.">
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <QueryError error={query.error} retry={() => void query.refetch()} />
      ) : !request ? (
        <>
          <Message
            tone="info"
            text={
              action.success ??
              'This request has expired or was already answered. Your current rules still apply.'
            }
          />
          <Button
            label="Back to Home"
            variant="secondary"
            onPress={() => router.replace('/home')}
          />
        </>
      ) : (
        <>
          <Row style={{ gap: 13, marginBottom: 26 }}>
            <PersonaMark persona={request.persona} size={53} />
            <View style={{ flex: 1, gap: 5 }}>
              <Type kind="display" style={{ fontSize: 24, textTransform: 'uppercase' }}>
                {request.persona} is asking
              </Type>
              <Type color={colors.muted} style={{ fontSize: 12 }}>
                One exception. A short leash.
              </Type>
            </View>
            <Pill label="YOUR CALL" color={colors.rope} />
          </Row>
          <Card
            style={{
              borderColor: `${colors.rope}45`,
              backgroundColor: `${colors.rope}07`,
              gap: 14,
              padding: 23,
            }}
          >
            <Label color={colors.rope}>The ask</Label>
            <Type kind="display" color={colors.rope} style={{ fontSize: 45 }}>
              {request.requested.maxLeverage}x for {Math.floor(request.requested.durationSec / 60)}{' '}
              min
            </Type>
            <Type color={colors.muted} style={{ fontSize: 12, lineHeight: 21 }}>
              Still capped at ${request.requested.maxNotionalUsd} per trade.{'\n'}At most $
              {request.requested.extraRiskUsd} extra risk.
            </Type>
            <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <Label color={colors.rope}>No permanent changes</Label>
              <Type kind="mono" color={colors.rope} style={{ fontSize: 9 }}>
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} left
              </Type>
            </Row>
          </Card>
          <View style={{ gap: 10, marginTop: 28, marginBottom: 28 }}>
            <Label>Why now?</Label>
            {request.why.map((why, i) => (
              <WhyChip key={i} {...why} />
            ))}
          </View>
          <Button
            label={config.useMocks ? 'Approve demo slack' : 'Approve with Face ID'}
            icon="face"
            disabled={!canApprove || !!action.pending}
            loading={action.busy}
            onPress={() =>
              void action.run(
                () => approveSlack(account!, request),
                config.useMocks
                  ? 'Demo slack approved. A new executed receipt is ready.'
                  : 'Slack granted onchain. Your trader is checking the trade again.',
              )
            }
          />
          <View style={{ height: 10 }} />
          <Button
            variant="ghost"
            label="Not now"
            disabled={action.busy}
            onPress={() =>
              void action.run(() => api.denySlack(request.id), 'Your rules stay as they are.')
            }
          />
          <Type
            color={colors.muted}
            style={{ textAlign: 'center', fontSize: 11, lineHeight: 19, marginTop: 18 }}
          >
            {config.useMocks
              ? 'Demo exception · expires on its own'
              : 'Expires on its own · written onchain'}
            {status.data?.state === 'PAUSED'
              ? '\nYour trader is paused. Resume before approving.'
              : ''}
          </Type>
        </>
      )}
      <Message text={action.error} />
      {action.pending && (
        <Button
          variant="secondary"
          label="Retry trader acknowledgment"
          loading={action.busy}
          onPress={() =>
            void action.run(
              () => retryConfirmedCallback(action.pending!),
              'Your trader received the approval. No new signature was needed.',
            )
          }
        />
      )}
      <Message text={action.success} tone="success" />
      {action.success && (
        <Button
          variant="secondary"
          label="See the new receipt"
          icon="receipt"
          onPress={() => router.replace('/receipts')}
        />
      )}
    </Screen>
  );
}
