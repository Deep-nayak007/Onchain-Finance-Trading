import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { colors } from '../theme';
export type IconName =
  | 'home'
  | 'receipt'
  | 'risk'
  | 'traders'
  | 'swap'
  | 'arrow'
  | 'back'
  | 'close'
  | 'check'
  | 'shield'
  | 'face'
  | 'plus'
  | 'pause'
  | 'chevron'
  | 'external'
  | 'bell'
  | 'refresh';
const paths: Partial<Record<IconName, string>> = {
  home: 'M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9',
  receipt: 'M5 3h14v18l-3-2-4 2-4-2-3 2V3m4 5h6m-6 4h6m-6 4h3',
  risk: 'M4 20V12m8 8V4m8 16V8',
  traders: 'M3 20c0-4 3-6 6-6s6 2 6 6m1-6c3 0 5 2 5 6',
  swap: 'M3 7h17l-4-4m4 4-4 4M21 17H4l4 4m-4-4 4-4',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  back: 'm14 5-7 7 7 7',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3m-4 9 3 3 5-6',
  face: 'M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3M8 9v2m8-2v2m-8 5c2 2 6 2 8 0m-4-6v3h-1',
  plus: 'M12 5v14M5 12h14',
  pause: 'M8 5v14m8-14v14',
  chevron: 'm9 5 7 7-7 7',
  external: 'M14 3h7v7m0-7L10 14m0-10H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-9 12h6',
  refresh: 'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3',
};
export function Icon({
  name,
  size = 20,
  color = colors.fg,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={paths[name]} />
      {name === 'traders' && (
        <>
          <Circle cx={9} cy={7} r={3} />
          <Path d="M17 4a3 3 0 0 1 0 6" />
        </>
      )}
    </Svg>
  );
}
export function BrandMark({ size = 26, color = colors.rope }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Path
        d="M12 6c-8 0-9 12-3 17l15 12c6 4 14-3 10-9L19 6c-4-6-15-2-12 5l15 23"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <Path d="m27 6-15 27" stroke={colors.bg} strokeWidth={6} />
      <Path d="m27 6-15 27" stroke={color} strokeWidth={3.2} strokeLinecap="round" />
    </Svg>
  );
}
export function PersonaMark({ persona, size = 48 }: { persona: string; size?: number }) {
  const color =
    persona === 'falcon' ? colors.rope : persona === 'otter' ? colors.accent : colors.ok;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Rect x={1} y={1} width={62} height={62} rx={18} fill={`${color}12`} stroke={`${color}30`} />
      {persona === 'falcon' ? (
        <>
          <Path
            d="m15 21 19 7 15-5-9 12-8 12-5-12-12-14Z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Path d="m15 21 19 7-7 7m7-7 6 7" stroke={color} strokeWidth={1.5} />
          <Circle cx={40} cy={28} r={1.4} fill={color} />
        </>
      ) : persona === 'otter' ? (
        <>
          <Path
            d="M20 27c-8-13 4-13 6-5 5-3 9-3 14 0 2-8 14-8 6 5 5 15-5 20-13 20s-18-5-13-20Z"
            stroke={color}
            strokeWidth={1.8}
          />
          <Path d="m29 35 4 3 4-3M24 38l-9-2m27 2 8-2" stroke={color} strokeWidth={1.5} />
          <Circle cx={25} cy={30} r={1.5} fill={color} />
          <Circle cx={41} cy={30} r={1.5} fill={color} />
        </>
      ) : (
        <>
          <Path d="m17 18 6 7h18l6-7v21c0 14-30 14-30 0V18Z" stroke={color} strokeWidth={1.8} />
          <Circle cx={25} cy={33} r={6} stroke={color} />
          <Circle cx={39} cy={33} r={6} stroke={color} />
          <Path d="m29 40 3 5 3-5" stroke={color} />
          <Circle cx={25} cy={33} r={1.6} fill={color} />
          <Circle cx={39} cy={33} r={1.6} fill={color} />
        </>
      )}
    </Svg>
  );
}
