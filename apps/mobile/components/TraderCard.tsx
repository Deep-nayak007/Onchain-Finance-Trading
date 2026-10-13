import { Pressable, View } from 'react-native';
import { colors } from '../theme';
import { Card, Label, Pill, Row, Type } from './ui';
import { PersonaMark, Icon } from './Icon';
import type { TraderStats } from '../lib/schemas';
import { percent } from '../lib/money';
export function TraderCard({
  trader,
  selected,
  onPress,
}: {
  trader: TraderStats;
  selected?: boolean;
  onPress: () => void;
}) {
  const p = trader.persona;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Hire ${p.name}`} onPress={onPress}>
      <Card style={{ borderColor: selected ? `${colors.rope}70` : colors.line, gap: 15 }}>
        <Row style={{ gap: 12 }}>
          <PersonaMark persona={p.id} />
          <View style={{ flex: 1, gap: 5 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Type
                kind="display"
                style={{ fontSize: 24, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {p.name}
              </Type>
              <Pill label={p.mode} color={p.mode === 'LIVE' ? colors.ok : colors.accent} />
            </Row>
            <Type color={colors.muted} style={{ fontSize: 12 }}>
              {p.style}
            </Type>
          </View>
        </Row>
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <Row style={{ justifyContent: 'space-between' }}>
          {[
            {
              label: '7 days',
              value: trader.sevenDayPct === null ? '—' : percent(trader.sevenDayPct, true),
              color: (trader.sevenDayPct ?? 0) >= 0 ? colors.ok : colors.bad,
            },
            {
              label: 'receipts',
              value: trader.receipts === null ? '—' : String(trader.receipts),
              color: colors.fg,
            },
            {
              label: 'max drop',
              value: trader.maxDrawdownPct === null ? '—' : percent(trader.maxDrawdownPct),
              color: colors.fg,
            },
          ].map((s) => (
            <View key={s.label} style={{ gap: 5 }}>
              <Type kind="display" color={s.color} style={{ fontSize: 23 }}>
                {s.value}
              </Type>
              <Label>{s.label}</Label>
            </View>
          ))}
          <Icon name="arrow" color={selected ? colors.rope : colors.muted} />
        </Row>
      </Card>
    </Pressable>
  );
}
