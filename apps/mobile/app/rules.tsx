import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { keccak256, toBytes } from 'viem';
import { canonicalJSON } from '@leash/shared/canonical';
import { Screen, Label, Type, Row, Card, Button, Message, styles } from '../components/ui';
import { PersonaMark, Icon } from '../components/Icon';
import { colors } from '../theme';
import { api } from '../lib/api';
import { useAction } from '../lib/useAction';
import { useSession } from '../lib/session';
import { config } from '../lib/config';
import { signRules, retryConfirmedCallback } from '../lib/actions';
import type { CompileResult, Persona } from '../lib/schemas';
export default function Rules() {
  const params = useLocalSearchParams<{ persona?: string }>();
  const [persona, setPersona] = useState<Persona['id']>(
    params.persona === 'otter' || params.persona === 'owl' ? params.persona : 'falcon',
  );
  const [text, setText] = useState(
    'Trade MON only. Up to 3x leverage, $25 per trade. Stop if I lose 5% in a week. Ask before going bigger.',
  );
  const [compiled, setCompiled] = useState<CompileResult | null>(null);
  const { account } = useSession();
  const action = useAction();
  const compile = () =>
    action.run(async () => {
      const card = await api.compile(account!, text.trim(), persona);
      const expected = keccak256(toBytes(canonicalJSON(card.policy)));
      if (expected.toLowerCase() !== card.policyHash.toLowerCase())
        throw new Error(
          'The rule card fingerprint does not match its policy. Do not sign; compile again.',
        );
      setCompiled(card);
    });
  return (
    <Screen
      back
      title="Your trader. Your rules."
      subtitle="Write it like you’d tell a person. We’ll make the limits precise."
    >
      <Label>Who’s on your leash?</Label>
      <Row style={{ marginTop: 12, marginBottom: 25, gap: 8 }}>
        {(['falcon', 'otter', 'owl'] as const).map((p) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityLabel={`Select ${p}`}
            accessibilityState={{ selected: persona === p }}
            disabled={action.busy}
            onPress={() => {
              setPersona(p);
              setCompiled(null);
              action.clear();
            }}
            style={{
              flex: 1,
              borderRadius: 13,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: persona === p ? colors.rope : colors.line,
              padding: 12,
              gap: 8,
              alignItems: 'center',
            }}
          >
            <PersonaMark persona={p} size={36} />
            <Type kind="display" style={{ fontSize: 17, textTransform: 'uppercase' }}>
              {p}
            </Type>
          </Pressable>
        ))}
      </Row>
      <Label>In your own words</Label>
      <TextInput
        accessibilityLabel="Your trading rules"
        multiline
        editable={!action.busy}
        maxLength={1200}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setCompiled(null);
          action.clear();
        }}
        placeholder="Only trade MON. Keep each trade small…"
        placeholderTextColor={colors.muted}
        textAlignVertical="top"
        style={[styles.input, { minHeight: 150, lineHeight: 24, marginTop: 12, marginBottom: 12 }]}
      />
      <Type color={colors.muted} style={{ fontSize: 11, lineHeight: 18, marginBottom: 20 }}>
        You can change the rules later. Your trader never gets to change them.
      </Type>
      <Button
        label={config.useMocks ? 'Preview sample Leash Card' : 'Make my Leash Card'}
        icon="arrow"
        loading={action.busy && !compiled}
        disabled={!account || text.trim().length < 10}
        onPress={() => void compile()}
      />
      {compiled && (
        <Card style={{ marginTop: 26, borderColor: `${colors.rope}50`, gap: 20 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label color={colors.rope}>Your Leash Card</Label>
            <PersonaMark persona={persona} size={30} />
          </Row>
          <Type kind="display" style={{ fontSize: 27, textTransform: 'uppercase' }}>
            {persona} · Bound to you
          </Type>
          <View style={{ gap: 15 }}>
            {compiled.leashCard.map((line, i) => (
              <Row key={i} style={{ alignItems: 'flex-start' }}>
                <Icon name="check" color={colors.rope} size={16} />
                <Type style={{ fontSize: 13, flex: 1, lineHeight: 20 }}>{line}</Type>
              </Row>
            ))}
          </View>
          <View style={{ height: 1, backgroundColor: colors.line }} />
          <Type
            kind="mono"
            color={colors.muted}
            numberOfLines={1}
            style={{ fontSize: 9, letterSpacing: 0 }}
          >
            Fingerprint {compiled.policyHash.slice(0, 18)}…
          </Type>
          {compiled.warnings.map((w, i) => (
            <Message key={i} tone="info" text={w} />
          ))}
          <Button
            label={config.useMocks ? 'Use these demo rules' : 'Sign with Face ID'}
            disabled={!!action.pending}
            icon="face"
            loading={action.busy}
            onPress={() =>
              void action.run(
                () => signRules(account!, compiled, persona),
                config.useMocks
                  ? 'Demo rules saved. Your trader is bound to this card.'
                  : 'Your rules confirmed. Your trader is activated.',
              )
            }
          />
          <Type color={colors.muted} style={{ fontSize: 11, textAlign: 'center', lineHeight: 18 }}>
            {config.useMocks
              ? 'Demo only · no wallet signature or transaction'
              : 'Written onchain. Enforced on every trade.'}
          </Type>
        </Card>
      )}
      <Message text={action.error} />
      {action.pending && (
        <Button
          variant="secondary"
          label="Retry trader activation"
          loading={action.busy}
          onPress={() =>
            void action.run(
              () => retryConfirmedCallback(action.pending!),
              'Your trader is activated. No new signature was needed.',
            )
          }
        />
      )}
      <Message text={action.success} tone="success" />
      {action.success && (
        <Button
          variant="secondary"
          label="Back to your trader"
          onPress={() => router.replace('/home')}
        />
      )}
    </Screen>
  );
}
