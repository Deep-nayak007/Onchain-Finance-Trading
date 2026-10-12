import { View } from 'react-native';
import { colors } from '../theme';
import { Type } from './ui';
export function WhyChip({ text, source }: { text: string; source: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.bg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <Type style={{ flex: 1, fontSize: 12, lineHeight: 19 }}>{text}</Type>
      <Type kind="mono" color={colors.muted} style={{ fontSize: 9, letterSpacing: 0.3 }}>
        {source}
      </Type>
    </View>
  );
}
