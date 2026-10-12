import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { Screen, Card, Label, Type, Row, Button, Message } from '../../components/ui';
import { colors } from '../../theme';
import { config } from '../../lib/config';
import { demoStore } from '../../mocks/store';
import { demoAccount, mockData } from '../../mocks/fixtures';
import { useAction } from '../../lib/useAction';
import { useSession } from '../../lib/session';
import { dollars } from '../../lib/money';
export default function MockControls() {
  const action = useAction();
  const session = useSession();
  if (!config.useMocks) return <Redirect href="/home" />;
  const reset = async () => {
    const done = await action.run(() => {
      demoStore.reset();
      session.connect(demoAccount, true);
    });
    if (done) router.replace('/home');
  };
  return (
    <Screen
      back
      title="Demo controls"
      subtitle="Repeat the full app flow while the team connects the real services."
    >
      <Card style={{ gap: 16 }}>
        <Label>Starting sample</Label>
        <Row style={{ justifyContent: 'space-between' }}>
          <Type>Wallet dollars</Type>
          <Type color={colors.rope}>{dollars(mockData.cashUsd)}</Type>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Type>Collateral</Type>
          <Type>{dollars(mockData.risk.collateralUsd)}</Type>
        </Row>
        <Type color={colors.muted} style={{ fontSize: 12, lineHeight: 20 }}>
          Falcon, Otter, and Owl. One open position, executed and denied receipts, two shadow
          receipts, and a pending slack request.
        </Type>
      </Card>
      <View style={{ gap: 12, marginTop: 24 }}>
        <Button
          label="Reset all mock data"
          icon="refresh"
          loading={action.busy}
          onPress={() => void reset()}
        />
        <Button
          label="Create a fresh slack request"
          icon="bell"
          variant="secondary"
          loading={action.busy}
          onPress={() =>
            void action.run(() => {
              if (!demoStore.receipts.some((r) => r.status === 'REJECTED')) demoStore.reset();
              demoStore.requestSlack();
            }, 'A fresh ten-minute request is ready. Open Home to review it.')
          }
        />
        <Button
          label="Show an empty portfolio"
          variant="secondary"
          onPress={() =>
            void action.run(
              () => demoStore.emptyPortfolio(),
              'Portfolio cleared for testing. Open Home, Receipts, or Risk; reset to restore samples.',
            )
          }
        />
        <Button label="Test onboarding" variant="ghost" onPress={() => router.push('/welcome')} />
        <Button label="Back to Home" variant="ghost" onPress={() => router.replace('/home')} />
      </View>
      <Message text={action.error} />
      <Message text={action.success} tone="success" />
      <Type color={colors.muted} style={{ fontSize: 11, lineHeight: 19, marginTop: 16 }}>
        Local samples only. Nothing is signed or sent to a blockchain.
      </Type>
    </Screen>
  );
}
