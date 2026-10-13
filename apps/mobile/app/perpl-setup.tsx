import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Label, Type, Card, Row, Button, Message, styles } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors } from '../theme';
import { useSession } from '../lib/session';
import { useAction } from '../lib/useAction';
import { config } from '../lib/config';
import { validAmount } from '../lib/money';
import { requireBindings } from '../integration/team';
import { signPrepared } from '../lib/actions';
import { demoStore } from '../mocks/store';
import { useRisk, useApiHealth } from '../lib/queries';
import type { TxRequest } from '../lib/schemas';
export default function PerplSetup() {
  const { account } = useSession();
  const action = useAction(),
    query = useRisk();
  const health = useApiHealth();
  const paper =
    !config.useMocks &&
    config.chainId === 10143 &&
    health.data?.chainId === config.chainId &&
    health.data.live === false;
  const [amount, setAmount] = useState('25');
  const [depositDone, setDepositDone] = useState(false);
  const [keyDone, setKeyDone] = useState(false);
  const [queue, setQueue] = useState<TxRequest[] | null>(null);
  const [confirmed, setConfirmed] = useState(0);
  const deposit = () =>
    action.run(
      async () => {
        if (!account || !validAmount(amount, 25))
          throw new Error('Enter a deposit between $0.01 and $25 for this demo.');
        if (config.useMocks) {
          if (Number(amount) > Number(demoStore.cashUsd))
            throw new Error('There are not enough demo dollars for this deposit.');
          demoStore.cashUsd = String(Number(demoStore.cashUsd) - Number(amount));
          demoStore.risk.collateralUsd = String(
            Number(demoStore.risk.collateralUsd) + Number(amount),
          );
          demoStore.risk.equityUsd = String(Number(demoStore.risk.equityUsd) + Number(amount));
          setDepositDone(true);
          return;
        }
        const transactions = queue ?? (await requireBindings().prepareDeposit(account, amount));
        if (transactions.length === 0)
          throw new Error('No deposit transactions were prepared. Ask Rails to check the gateway.');
        setQueue(transactions);
        for (let i = confirmed; i < transactions.length; i++) {
          await signPrepared(account, transactions[i]!);
          setConfirmed(i + 1);
        }
        setDepositDone(true);
      },
      config.useMocks
        ? 'Demo deposit added. No funds were moved.'
        : 'Deposit confirmed. Your collateral is on Perpl.',
    );
  return (
    <Screen
      back
      title="Fund the leash."
      subtitle="Your dollars stay yours. Your trader only gets permission to trade."
    >
      <Card style={{ gap: 14 }}>
        <Label>01 · Deposit dollars</Label>
        <Row style={{ alignItems: 'baseline' }}>
          <Type kind="display" color={colors.muted} style={{ fontSize: 38 }}>
            $
          </Type>
          <TextInput
            accessibilityLabel="Deposit amount in dollars"
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setDepositDone(false);
              setQueue(null);
              setConfirmed(0);
              action.clear();
            }}
            editable={!action.busy && confirmed === 0}
            keyboardType="decimal-pad"
            style={[styles.input, { flex: 1, fontSize: 30, padding: 12 }]}
            maxLength={12}
          />
        </Row>
        <Type color={colors.muted} style={{ fontSize: 11, lineHeight: 19 }}>
          Start small. Deposits are capped at $25 in this build.
        </Type>
        <Button
          label={
            depositDone
              ? 'Deposit ready'
              : config.useMocks
                ? 'Add demo dollars'
                : confirmed > 0
                  ? 'Continue deposit with Face ID'
                  : 'Deposit with Face ID'
          }
          icon="face"
          disabled={depositDone || !validAmount(amount, 25) || !account}
          loading={action.busy}
          onPress={() => void deposit()}
        />
        {queue && (
          <Type color={colors.rope} style={{ fontSize: 11 }}>
            {confirmed} of {queue.length} transactions confirmed. Each signature is separate.
          </Type>
        )}
        <Type color={colors.muted} style={{ fontSize: 9 }}>
          AUSD collateral · token and decimals confirmed by Rails before live use
        </Type>
      </Card>
      <Card style={{ marginTop: 16, gap: 14 }}>
        <Label>02 · Give trade-only permission</Label>
        <Type kind="display" style={{ fontSize: 27 }}>
          TRADING. NO WITHDRAWALS.
        </Type>
        <Type color={colors.muted} style={{ fontSize: 12, lineHeight: 21 }}>
          The exchange key lets your trader place orders. It cannot withdraw your collateral. You
          keep the key that can.
        </Type>
        <Button
          variant="secondary"
          label={
            keyDone
              ? 'Trader authorized'
              : config.useMocks
                ? 'Authorize demo trader'
                : 'Authorize with Face ID'
          }
          icon="shield"
          disabled={!depositDone || keyDone}
          loading={action.busy}
          onPress={() =>
            void action.run(
              async () => {
                if (!config.useMocks) {
                  const txs = await requireBindings().prepareKeyEnrollment(account!);
                  if (!txs.length)
                    throw new Error(
                      'Key enrollment is not ready. Rails must resolve the exchange permission flow.',
                    );
                  for (const tx of txs) await signPrepared(account!, tx);
                }
                setKeyDone(true);
              },
              config.useMocks
                ? 'Demo trade-only permission enabled.'
                : 'Exchange trade-only key authorized.',
            )
          }
        />
      </Card>
      <Message text={action.error} />
      <Message text={action.success} tone="success" />
      <Row style={{ justifyContent: 'space-between', marginTop: 20, marginBottom: 20 }}>
        <Label>Collateral</Label>
        <Type kind="display" style={{ fontSize: 25 }}>
          {query.data ? `$${Number(query.data.collateralUsd).toFixed(2)}` : '—'}
        </Type>
      </Row>
      {paper && (
        <Card style={{ marginTop: 4, gap: 8 }}>
          <Label>Monad testnet · paper trading</Label>
          <Type color={colors.muted} style={{ fontSize: 12, lineHeight: 20 }}>
            Perpl testnet collateral (AUSD) isn&apos;t available yet, so deposits and the exchange
            key are skipped. Your trader still decides on live Perpl prices, every decision is
            checked by your rules and receipted onchain, and orders are simulated (paper) until
            collateral exists.
          </Type>
        </Card>
      )}
      {(keyDone || paper) && (
        <Button label="Write my rules" icon="arrow" onPress={() => router.push('/rules')} />
      )}
      <View style={{ marginTop: 15 }}>
        <Button
          label="Explore while I wait"
          variant="ghost"
          onPress={() => router.replace('/home')}
        />
      </View>
    </Screen>
  );
}
