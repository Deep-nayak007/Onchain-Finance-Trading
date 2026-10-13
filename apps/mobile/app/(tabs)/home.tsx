import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Screen,
  Type,
  Label,
  Row,
  Card,
  Pill,
  Button,
  SectionTitle,
  Message,
  Loading,
  QueryError,
} from '../../components/ui';
import { Icon, PersonaMark } from '../../components/Icon';
import { LeashRing } from '../../components/LeashRing';
import { PullLeashButton } from '../../components/PullLeashButton';
import { ReceiptPaper } from '../../components/ReceiptPaper';
import { FiveKnots } from '../../components/FiveKnots';
import { colors } from '../../theme';
import { useRisk, useStatus, useReceipts, useSlack, usePolicy } from '../../lib/queries';
import { useSession } from '../../lib/session';
import { useAction } from '../../lib/useAction';
import {
  pullLeash,
  resumeTrader,
  retryConfirmedCallback,
  reconnectTrader,
} from '../../lib/actions';
import { dollars, percent } from '../../lib/money';
import { envio } from '../../lib/envio';
import { config } from '../../lib/config';
import { api } from '../../lib/api';
export default function Home() {
  const { account } = useSession();
  const risk = useRisk(),
    status = useStatus(),
    receipts = useReceipts(),
    slack = useSlack(),
    policy = usePolicy();
  const balance = useQuery({
    queryKey: ['balance', account],
    queryFn: () => envio.balance(account!),
    enabled: !!account,
    refetchInterval: 4000,
  });
  const action = useAction();
  const paused = status.data?.state === 'PAUSED' || status.data?.state === 'KILLED';
  const active = status.data?.state === 'RUNNING' || status.data?.state === 'ACTIVE';
  const persona = status.data?.persona ?? 'your trader';
  const budget = policy.data
    ? (Number(policy.data.sleeveUsd) * policy.data.maxWeeklyLossPct) / 100
    : 0;
  const latest = receipts.data?.find((r) => r.status === 'EXECUTED' || r.status === 'SHADOW');
  return (
    <Screen
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try to break the leash"
          onPress={() => router.push('/break-leash')}
          style={{ padding: 7 }}
        >
          <Icon name="shield" color={colors.muted} size={19} />
        </Pressable>
      }
    >
      <View style={{ gap: 7 }}>
        <Label>Your balance · dollars</Label>
        {balance.isPending ? (
          <Loading />
        ) : balance.error ? (
          <QueryError error={balance.error} retry={() => void balance.refetch()} />
        ) : (
          <Type kind="display" style={{ fontSize: 54, letterSpacing: -0.6 }}>
            {dollars(balance.data ?? '0')}
          </Type>
        )}
        <Row>
          <Pill
            label={
              paused
                ? 'PAUSED'
                : active
                  ? 'ON A LEASH'
                  : status.data?.state === 'RECOVERY_REQUIRED'
                    ? 'RECONNECT'
                    : status.data?.state === 'NOT_STARTED'
                      ? 'SET RULES'
                      : 'CONNECTING'
            }
            color={paused || !active ? colors.rope : colors.ok}
          />
          <Type color={colors.muted} style={{ fontSize: 11 }}>
            Your keys stay yours.
          </Type>
        </Row>
      </View>
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 24 }} />
      {risk.isPending ? (
        <Loading />
      ) : risk.error ? (
        <QueryError error={risk.error} retry={() => void risk.refetch()} />
      ) : (
        <Card style={{ padding: 17 }}>
          <Row style={{ gap: 18 }}>
            <LeashRing slackLeftUsd={risk.data!.slackLeftUsd} weeklyBudgetUsd={String(budget)} />
            <View style={{ flex: 1, gap: 11 }}>
              <PersonaMark persona={persona} size={43} />
              <Type kind="display" style={{ fontSize: 25, textTransform: 'uppercase' }}>
                {persona}
              </Type>
              <Pill
                label={paused ? 'PAUSED' : active ? 'TRADER ACTIVE' : 'WAITING'}
                color={paused || !active ? colors.rope : colors.ok}
              />
              <Type color={colors.muted} style={{ fontSize: 11, lineHeight: 17 }}>
                {paused
                  ? 'Waiting for you. Only you can resume.'
                  : active
                    ? 'Room to trade. Bound by your rules.'
                    : 'Set your rules or reconnect your trader to start.'}
              </Type>
            </View>
          </Row>
        </Card>
      )}
      <Row style={{ marginTop: 12, alignItems: 'stretch' }}>
        <Card style={{ flex: 1, padding: 16, gap: 8 }}>
          <Label>This week</Label>
          <Type
            kind="display"
            color={(risk.data?.weeklyPnlPct ?? 0) >= 0 ? colors.ok : colors.bad}
            style={{ fontSize: 30 }}
          >
            {risk.data ? percent(risk.data.weeklyPnlPct, true) : '—'}
          </Type>
          <Type color={colors.muted} style={{ fontSize: 11 }}>
            week P&L
          </Type>
        </Card>
        <Pressable
          style={{ flex: 1 }}
          accessibilityRole="button"
          onPress={() => router.push('/rules')}
        >
          <Card style={{ gap: 8, padding: 16 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Label>Your rules</Label>
              <Icon name="arrow" size={14} color={colors.muted} />
            </Row>
            <Type kind="display" style={{ fontSize: 30 }}>
              {policy.data
                ? `${policy.data.maxLeverage}x / $${policy.data.maxNotionalUsd}`
                : 'Set rules'}
            </Type>
            <Type color={colors.muted} style={{ fontSize: 11 }}>
              leverage / per trade
            </Type>
          </Card>
        </Pressable>
      </Row>
      {slack.data?.[0] && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Review slack request"
          onPress={() => router.push(`/slack/${slack.data![0]!.id}`)}
          style={{
            marginTop: 16,
            borderRadius: 14,
            borderColor: `${colors.rope}40`,
            borderWidth: 1,
            backgroundColor: `${colors.rope}09`,
            padding: 14,
          }}
        >
          <Row>
            <Icon name="bell" color={colors.rope} size={18} />
            <View style={{ flex: 1, gap: 3 }}>
              <Type color={colors.rope} kind="semibold" style={{ fontSize: 12 }}>
                Falcon is asking for more leash
              </Type>
              <Type color={colors.muted} style={{ fontSize: 11 }}>
                5x for 60 min. You decide.
              </Type>
            </View>
            <Icon name="chevron" color={colors.rope} size={16} />
          </Row>
        </Pressable>
      )}
      <View style={{ marginTop: 18 }}>
        {paused ? (
          <Button
            label={config.useMocks ? 'Resume demo trader' : 'Resume with Face ID'}
            disabled={!!action.pending}
            icon="face"
            variant="secondary"
            loading={action.busy}
            onPress={() =>
              void action.run(() => resumeTrader(account!), 'Your trader can trade again.')
            }
          />
        ) : (
          <PullLeashButton
            busy={action.busy}
            onPull={() =>
              void action.run(
                () => pullLeash(account!),
                config.useMocks
                  ? 'Demo trader paused. No onchain transaction was sent.'
                  : 'Your pause confirmed onchain.',
              )
            }
          />
        )}
      </View>
      <Message text={action.error} />
      {!config.useMocks && status.data?.state === 'RECOVERY_REQUIRED' && (
        <>
          <Message
            tone="info"
            text="Your rules are onchain, but Brain has no current trader record. Reconnect using your saved rules; Brain verifies their onchain hash."
          />
          <Button
            label="Reconnect my trader"
            variant="secondary"
            loading={action.busy}
            onPress={() =>
              void action.run(() => reconnectTrader(account!), 'Your trader reconnected.')
            }
          />
        </>
      )}
      {action.pending && (
        <Button
          variant="secondary"
          label="Retry trader setup"
          loading={action.busy}
          onPress={() =>
            void action.run(
              () => retryConfirmedCallback(action.pending!),
              'Your trader setup restarted. No new signature was needed.',
            )
          }
        />
      )}
      <Message text={action.success} tone="success" />
      {action.error?.includes('backend cleanup') && (
        <Button
          variant="secondary"
          label="Retry trader cleanup"
          loading={action.busy}
          onPress={() => void action.run(() => api.kill(account!), 'Backend cleanup completed.')}
        />
      )}
      <Row style={{ justifyContent: 'space-between', marginTop: 17 }}>
        {[
          { label: 'Add dollars', icon: 'plus' as const, route: '/perpl-setup' as const },
          { label: 'Trade', icon: 'risk' as const, route: '/trade' as const },
          { label: 'Swap', icon: 'swap' as const, route: '/spot' as const },
        ].map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => router.push(a.route)}
            style={{ alignItems: 'center', gap: 8, padding: 8, width: '30%' }}
          >
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.surface,
                width: 44,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={a.icon} color={colors.accent} size={18} />
            </View>
            <Type color={colors.muted} style={{ fontSize: 11 }}>
              {a.label}
            </Type>
          </Pressable>
        ))}
      </Row>
      <SectionTitle
        title="Latest receipt"
        action="View all"
        onPress={() => router.push('/receipts')}
      />
      {latest ? (
        <ReceiptPaper
          receipt={latest}
          compact
          onPress={() => router.push(`/receipt/${latest.reasonHash}`)}
        />
      ) : receipts.isPending ? (
        <Loading />
      ) : receipts.error ? (
        <QueryError error={receipts.error} retry={() => void receipts.refetch()} />
      ) : (
        <Type color={colors.muted}>Your first decision will appear here.</Type>
      )}
      <FiveKnots />
      <Type color={colors.muted} style={{ fontSize: 10, textAlign: 'center' }}>
        Five knots. Five ways to keep you in control.
      </Type>
      {status.error && <QueryError error={status.error} retry={() => void status.refetch()} />}
    </Screen>
  );
}
