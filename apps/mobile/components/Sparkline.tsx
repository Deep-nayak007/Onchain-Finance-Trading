import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import { colors } from '../theme';
export function Sparkline({
  values,
  height = 76,
  color = colors.ok,
}: {
  values: number[];
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1;
  const points = values
    .map(
      (v, i) =>
        `${i === 0 ? 'M' : 'L'}${(i / (values.length - 1)) * 340},${height - 10 - ((v - min) / range) * (height - 20)}`,
    )
    .join(' ');
  return (
    <Svg
      width="100%"
      height={height}
      viewBox={`0 0 340 ${height}`}
      preserveAspectRatio="none"
      accessibilityLabel="Profit and loss curve"
    >
      <Defs>
        <LinearGradient id="pnl" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.2} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${points} L340,${height} L0,${height} Z`} fill="url(#pnl)" />
      <Path d={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}
