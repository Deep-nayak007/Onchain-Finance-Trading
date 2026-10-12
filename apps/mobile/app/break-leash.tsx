import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Label, Type, Row, Card, Button } from '../components/ui';
import { FiveKnots, knots } from '../components/FiveKnots';
import { Stamp } from '../components/ReceiptPaper';
import { colors } from '../theme';
const attacks = [
  {
    title: 'Trade at 20x leverage',
    knot: 0,
    why: 'Your signed 3x rule rejects the trade before execution.',
    code: 'LEVERAGE_EXCEEDS',
  },
  {
    title: 'Send spot dollars to a stranger',
    knot: 1,
    why: 'The wallet policy restricts transfers to approved venues and back to you.',
    code: 'RECIPIENT_BLOCKED',
  },
  {
    title: 'Withdraw with a leaked trading key',
    knot: 2,
    why: 'The exchange key can trade. It has no withdrawal authority.',
    code: 'CANNOT_WITHDRAW',
  },
  {
    title: 'Keep trading on stale data',
    knot: 3,
    why: 'Three stale checks make the Referee pause the trader. It fails closed.',
    code: 'REFEREE_STALE',
  },
  {
    title: 'Trade after you pull the leash',
    knot: 4,
    why: 'Your passkey-signed pause stops the trader. Only you can resume.',
    code: 'PAUSED',
  },
  {
    title: 'Edit the why after the trade',
    knot: 0,
    why: 'Changing the intent or decision changes its fingerprint. The phone shows a mismatch.',
    code: 'HASH_MISMATCH',
  },
  {
    title: 'Cherry-pick a shadow track record',
    knot: 3,
    why: 'Shadow decisions are committed before outcomes. The public indexed record includes the misses.',
    code: 'PUBLIC_COMMITMENT',
  },
];
export default function BreakLeash() {
  const [selected, setSelected] = useState(0);
  const attack = attacks[selected]!;
  return (
    <Screen
      back
      title="Try to break the leash."
      subtitle="Pick a bad idea. See which safeguard stops it."
    >
      <Label>What should the trader try?</Label>
      <View style={{ gap: 8, marginTop: 14 }}>
        {attacks.map((a, i) => (
          <Pressable
            key={a.title}
            accessibilityRole="button"
            accessibilityState={{ selected: i === selected }}
            onPress={() => setSelected(i)}
            style={{
              padding: 13,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: selected === i ? colors.rope : colors.line,
              backgroundColor: selected === i ? `${colors.rope}09` : colors.surface,
            }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <Type style={{ fontSize: 12 }}>{a.title}</Type>
              <Type color={selected === i ? colors.rope : colors.muted}>→</Type>
            </Row>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: 15 }}>
        <FiveKnots active={attack.knot} />
      </View>
      <Card style={{ gap: 15, marginTop: 15, borderColor: `${colors.bad}45` }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label color={colors.rope}>Stopped by {knots[attack.knot]}</Label>
          <Stamp status="REJECTED" />
        </Row>
        <Type style={{ lineHeight: 23, fontSize: 13 }}>{attack.why}</Type>
        <Type kind="mono" color={colors.bad} style={{ fontSize: 10 }}>
          {attack.code}
        </Type>
        <Type color={colors.muted} style={{ fontSize: 10, lineHeight: 17 }}>
          Illustrated threat model. This screen explains the safeguards; it does not submit an
          attack or claim a live enforcement test.
        </Type>
      </Card>
      <View style={{ marginTop: 22 }}>
        <Button
          label="See a receipt check fail"
          icon="receipt"
          variant="secondary"
          onPress={() => router.push('/receipts')}
        />
      </View>
    </Screen>
  );
}
