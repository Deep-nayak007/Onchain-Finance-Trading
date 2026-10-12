import { Pressable, View } from 'react-native';
import { colors } from '../theme';
import { Label, Type } from './ui';
export const knots = ['Rules', 'Wallet', 'Exchange', 'Referee', 'You'] as const;
export function FiveKnots({
  active,
  onSelect,
}: {
  active?: number;
  onSelect?: (index: number) => void;
}) {
  return (
    <View style={{ marginVertical: 16 }}>
      <View
        style={{
          position: 'absolute',
          left: 25,
          right: 25,
          top: 16,
          height: 1,
          backgroundColor: `${colors.rope}50`,
        }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {knots.map((k, i) => (
          <Pressable
            key={k}
            disabled={!onSelect}
            accessibilityRole={onSelect ? 'button' : undefined}
            accessibilityLabel={k}
            onPress={() => onSelect?.(i)}
            style={{ width: 60, alignItems: 'center', gap: 11 }}
          >
            <View
              style={{
                height: 33,
                width: 33,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: active === i ? colors.bad : `${colors.rope}65`,
                backgroundColor: active === i ? `${colors.bad}18` : colors.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Type
                kind="mono"
                color={active === i ? colors.bad : colors.rope}
                style={{ fontSize: 10 }}
              >
                {active === i ? '×' : String(i + 1).padStart(2, '0')}
              </Type>
            </View>
            <Label color={active === i ? colors.bad : colors.muted}>{k}</Label>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
