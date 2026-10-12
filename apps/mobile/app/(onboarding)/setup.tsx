import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Type, Card, Label, Row, Button, Message } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { colors } from '../../theme';
import { useSession } from '../../lib/session';
import { useAction } from '../../lib/useAction';
import { coverGas } from '../../lib/gas';
import { registerPush } from '../../lib/notifications';
import { config } from '../../lib/config';
export default function Setup() {
  const { account, isDemo } = useSession();
  const action = useAction();
  const [funded, setFunded] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  return (
    <Screen back title="Meet your wallet." subtitle="No seed phrase. No gas errands. Just you.">
      <Card style={{ gap: 16 }}>
        <Label>Your account</Label>
        <Type selectable kind="mono" style={{ fontSize: 11, lineHeight: 20, letterSpacing: 0.2 }}>
          {account ?? 'Sign in to show your account.'}
        </Type>
        <Row>
          <Icon name="shield" color={colors.ok} />
          <Type color={colors.muted} style={{ fontSize: 12 }}>
            {isDemo ? 'Demo account · sample data' : 'Derived from your passkey. Held by you.'}
          </Type>
        </Row>
      </Card>
      <View style={{ marginTop: 24, gap: 18 }}>
        {[
          'Your keys stay with you',
          'Your gas is covered',
          'Your trader asks before stretching',
        ].map((t, i) => (
          <Row key={t} style={{ gap: 12 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                borderWidth: 1,
                borderColor: colors.line,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Type kind="mono" color={colors.rope}>
                {i + 1}
              </Type>
            </View>
            <Type style={{ fontSize: 13 }}>{t}</Type>
          </Row>
        ))}
      </View>
      <View style={{ marginTop: 28 }}>
        <Button
          label={funded ? 'Gas ready' : config.useMocks ? 'Prepare demo account' : 'Cover my gas'}
          icon="check"
          disabled={!account || funded}
          loading={action.busy}
          onPress={() =>
            void action.run(
              async () => {
                await coverGas(account!);
                setFunded(true);
                setPushStatus(await registerPush(account!));
              },
              config.useMocks
                ? 'Demo account ready. No funds were sent.'
                : 'Your wallet has gas for signing.',
            )
          }
        />
      </View>
      <Message text={action.error} />
      <Message text={action.success} tone="success" />
      {pushStatus && <Message text={pushStatus} tone="info" />}
      {funded && (
        <Button
          variant="secondary"
          label="Set up my trader"
          icon="arrow"
          onPress={() => router.replace('/perpl-setup')}
        />
      )}
    </Screen>
  );
}
