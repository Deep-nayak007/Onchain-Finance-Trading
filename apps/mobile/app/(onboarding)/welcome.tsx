import { Platform, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { Screen, Type, Label, Button, Message } from '../../components/ui';
import { FiveKnots } from '../../components/FiveKnots';
import { colors } from '../../theme';
import { useSession } from '../../lib/session';
import { useAction } from '../../lib/useAction';
import { createAccount, signIn } from '../../lib/mera';
import { demoAccount } from '../../mocks/fixtures';
import { config } from '../../lib/config';
import { testnetHandoff } from '../../integration/testnet';
import { passkeySetupIssue } from '../../lib/passkeySetup';
export default function Welcome() {
  const session = useSession();
  const action = useAction();
  const setupIssue = config.useMocks
    ? null
    : passkeySetupIssue({
        platform: Platform.OS,
        rpId: config.rpId,
        hostname: Platform.OS === 'web' ? globalThis.location?.hostname : undefined,
        appleTeamId: Constants.expoConfig?.ios?.appleTeamId,
      });
  const connect = (restore: boolean) =>
    action.run(async () => {
      if (config.useMocks) {
        session.connect(demoAccount, true);
        router.push('/setup');
        return;
      }
      const account = await (restore ? signIn() : createAccount());
      session.connect(account);
      router.push('/setup');
    });
  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 32 }}>
        <Svg width={250} height={200} viewBox="0 0 250 200" fill="none">
          <Circle cx={125} cy={95} r={82} stroke={colors.line} strokeDasharray="3 7" />
          <Circle cx={125} cy={95} r={58} stroke={colors.line} />
          <Path
            d="M36 162C-9 102 84 94 148 43c62-50 116 35 49 61L76 155c-68 30-59-73 1-67l147 20"
            stroke={colors.rope}
            strokeWidth={7}
            strokeLinecap="round"
          />
          <Path d="m77 88 43 4" stroke={colors.bg} strokeWidth={12} />
          <Path
            d="M77 88c23 2 52 8 72 12"
            stroke={colors.rope}
            strokeWidth={7}
            strokeLinecap="round"
          />
          <Circle cx={224} cy={108} r={7} fill={colors.rope} />
          <Circle cx={37} cy={162} r={5} fill={colors.bg} stroke={colors.rope} strokeWidth={3} />
        </Svg>
      </View>
      <Label color={colors.rope}>An AI trader. On your terms.</Label>
      <Type
        kind="display"
        style={{ fontSize: 52, lineHeight: 57, marginTop: 13, marginBottom: 20 }}
      >
        GIVE IT SLACK.{'\n'}NEVER YOUR KEYS.
      </Type>
      <Type color={colors.muted} style={{ fontSize: 14, lineHeight: 24, marginBottom: 27 }}>
        Your trader can trade. It can’t withdraw, break your rules, or hide a decision. And you can
        stop it with a touch.
      </Type>
      <Button
        label={config.useMocks ? 'Continue with demo account' : 'Continue with Face ID'}
        icon="face"
        loading={action.busy}
        disabled={!!setupIssue}
        onPress={() => void connect(false)}
      />
      <View style={{ height: 9 }} />
      <Button
        variant="ghost"
        label={config.useMocks ? 'Restore demo account' : 'I already have a passkey'}
        disabled={!!setupIssue || action.busy}
        onPress={() => void connect(true)}
      />
      {config.useMocks && (
        <Button
          variant="secondary"
          label="Explore the demo"
          icon="arrow"
          onPress={() => {
            session.connect(demoAccount, true);
            router.replace('/home');
          }}
        />
      )}
      {!config.useMocks && config.chainId === 10143 && (
        <Button
          variant="secondary"
          label="Explore the live demo"
          icon="arrow"
          onPress={() => router.push('/live-demo')}
        />
      )}
      {!config.useMocks && config.chainId === 10143 && (
        <Button
          variant="secondary"
          label="Check the testnet receipt"
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
      )}
      {!config.useMocks && (
        <Button
          variant="ghost"
          label="Check live connections"
          onPress={() => router.push('/dev/services')}
        />
      )}
      {(config.useMocks || setupIssue) && (
        <Type
          color={colors.muted}
          style={{ fontSize: 11, lineHeight: 18, marginTop: 14, textAlign: 'center' }}
        >
          {config.useMocks
            ? 'Demo account ready. No Face ID or backend is needed for testing.'
            : setupIssue}
        </Type>
      )}
      <Message text={action.error} />
      <FiveKnots />
      <Type color={colors.muted} style={{ fontSize: 10, textAlign: 'center' }}>
        Five safeguards. You hold the last one.
      </Type>
    </Screen>
  );
}
