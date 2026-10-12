import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme';
import { Type } from './ui';
import { BrandMark } from './Icon';
import { useReducedMotion } from '../lib/useReducedMotion';
export function PullLeashButton({ onPull, busy = false }: { onPull: () => void; busy?: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completed = useRef(false);
  const [holding, setHolding] = useState(false);
  const reduced = useReducedMotion();
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    progress.stopAnimation();
    progress.setValue(0);
    setHolding(false);
  };
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancel();
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      progress.stopAnimation();
      sub.remove();
    };
  }, [progress]);
  const start = () => {
    if (busy) return;
    cancel();
    completed.current = false;
    setHolding(true);
    if (!reduced)
      Animated.timing(progress, { toValue: 1, duration: 1200, useNativeDriver: false }).start();
    timer.current = setTimeout(() => {
      if (completed.current) return;
      completed.current = true;
      timer.current = null;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      onPull();
    }, 1200);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Hold to pull the leash"
      accessibilityHint="Hold for 1.2 seconds, then confirm with your passkey to pause trading"
      disabled={busy}
      onPressIn={start}
      onPressOut={cancel}
      style={{
        height: 55,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${colors.bad}60`,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: busy ? 0.5 : 1,
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          backgroundColor: `${colors.bad}20`,
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <BrandMark size={22} color={colors.bad} />
        <Type kind="semibold" color={colors.bad} style={{ fontSize: 13 }}>
          {busy ? 'Pausing your trader…' : holding ? 'Keep holding…' : 'Hold to pull the leash'}
        </Type>
      </View>
    </Pressable>
  );
}
