import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme';
import { Type } from './ui';
import { useReducedMotion } from '../lib/useReducedMotion';
export function LeashRing({
  slackLeftUsd,
  weeklyBudgetUsd,
}: {
  slackLeftUsd: string;
  weeklyBudgetUsd: string;
}) {
  const ratio =
    Number(weeklyBudgetUsd) > 0
      ? Math.max(0, Math.min(1, Number(slackLeftUsd) / Number(weeklyBudgetUsd)))
      : 0;
  const [progress, setProgress] = useState(ratio);
  const reduced = useReducedMotion();
  const length = 2 * Math.PI * 66;
  useEffect(() => {
    if (reduced) {
      setProgress(ratio);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const from = progress;
    const animate = (time: number) => {
      const elapsed = Math.min(1, (time - start) / 650);
      setProgress(from + (ratio - from) * (1 - Math.pow(1 - elapsed, 3)));
      if (elapsed < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [ratio, reduced]);
  return (
    <View
      accessible
      accessibilityLabel={`${slackLeftUsd} dollars of slack left out of ${weeklyBudgetUsd} dollars this week`}
      style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={150} height={150} style={{ position: 'absolute' }}>
        <Circle cx={75} cy={75} r={66} stroke={colors.line} strokeWidth={9} fill="none" />
        <Circle
          cx={75}
          cy={75}
          r={66}
          stroke={colors.rope}
          strokeWidth={9}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${length} ${length}`}
          strokeDashoffset={length * (1 - progress)}
          transform="rotate(-90 75 75)"
        />
      </Svg>
      <Type kind="display" color={colors.rope} style={{ fontSize: 38 }}>
        ${Number(slackLeftUsd).toFixed(0)}
      </Type>
      <Type color={colors.muted} style={{ fontSize: 11, marginTop: -2 }}>
        slack left
      </Type>
      <Type
        kind="mono"
        color={colors.muted}
        style={{ fontSize: 8, letterSpacing: 0.1, marginTop: 5 }}
      >
        of ${Number(weeklyBudgetUsd).toFixed(0)} this week
      </Type>
    </View>
  );
}
