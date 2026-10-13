import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, fonts } from '../theme';
import { BrandMark, Icon, type IconName } from './Icon';
import { config } from '../lib/config';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
export function Type({
  kind = 'body',
  color,
  style,
  ...props
}: TextProps & { kind?: 'body' | 'display' | 'mono' | 'semibold'; color?: string }) {
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: fonts[kind],
          color: color ?? colors.fg,
          fontSize: kind === 'mono' ? 10 : 14,
          ...(kind === 'mono' ? { letterSpacing: 1.05 } : {}),
        },
        style,
      ]}
    />
  );
}
export function Label({
  children,
  color = colors.muted,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <Type kind="mono" color={color} style={{ textTransform: 'uppercase' }}>
      {children}
    </Type>
  );
}
export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Pill({ label, color = colors.ok }: { label: string; color?: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 100,
        backgroundColor: `${color}16`,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
      }}
    >
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
      <Type kind="mono" color={color} style={{ fontSize: 9 }}>
        {label}
      </Type>
    </View>
  );
}
export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
}) {
  const fg = variant === 'primary' ? colors.bg : variant === 'danger' ? colors.bad : colors.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor:
            variant === 'primary'
              ? colors.accent
              : variant === 'secondary'
                ? colors.surface
                : 'transparent',
          borderColor:
            variant === 'danger'
              ? `${colors.bad}70`
              : variant === 'primary' || variant === 'ghost'
                ? 'transparent'
                : colors.line,
          opacity: disabled || loading ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Icon name={icon} color={fg} size={18} />
      ) : null}
      <Type kind="semibold" color={fg}>
        {loading ? 'Please wait…' : label}
      </Type>
    </Pressable>
  );
}
export function Screen({
  children,
  title,
  subtitle,
  back = false,
  action,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean;
  action?: React.ReactNode;
}) {
  const health = useQuery({
    queryKey: ['api-health', config.apiUrl],
    queryFn: api.health,
    enabled: !config.useMocks && !!config.apiUrl,
    staleTime: 30000,
  });
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Row style={{ justifyContent: 'space-between', marginBottom: 28 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={back ? 'Go back' : 'LEASH · welcome'}
            onPress={() =>
              back
                ? router.canGoBack()
                  ? router.back()
                  : router.replace('/home')
                : router.push('/welcome')
            }
          >
            <Row>
              {back ? <Icon name="back" /> : <BrandMark />}
              <Type kind="display" style={{ fontSize: 24, letterSpacing: 2 }}>
                {back ? 'LEASH' : 'LEASH'}
              </Type>
            </Row>
          </Pressable>
          <Row>
            {config.useMocks ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mock data controls"
                onPress={() => router.push('/dev/mocks')}
              >
                <Pill label="DEMO" color={colors.accent} />
              </Pressable>
            ) : (
              <Label>{config.networkName}</Label>
            )}
            {action}
          </Row>
        </Row>
        {!config.useMocks && health.data && (
          <View style={{ marginBottom: 18 }}>
            <Pill
              label={health.data.live ? 'LIVE TRADES' : 'PAPER MODE'}
              color={health.data.live ? colors.ok : colors.rope}
            />
          </View>
        )}
        {title && (
          <View style={{ gap: 7, marginBottom: 26 }}>
            <Type
              kind="display"
              accessibilityRole="header"
              style={{ fontSize: 32, letterSpacing: 0.7, textTransform: 'uppercase' }}
            >
              {title}
            </Type>
            {subtitle && (
              <Type color={colors.muted} style={{ lineHeight: 21 }}>
                {subtitle}
              </Type>
            )}
          </View>
        )}
        {children}
        <View style={{ height: 12 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
export function SectionTitle({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 26, marginBottom: 14 }}>
      <Label>{title}</Label>
      {action && (
        <Pressable accessibilityRole="button" onPress={onPress}>
          <Type color={colors.accent} style={{ fontSize: 12 }}>
            {action} →
          </Type>
        </Pressable>
      )}
    </Row>
  );
}
export function Message({
  text,
  tone = 'error',
}: {
  text?: string | null;
  tone?: 'error' | 'success' | 'info';
}) {
  if (!text) return null;
  const color = tone === 'error' ? colors.bad : tone === 'success' ? colors.ok : colors.rope;
  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: 14,
        borderRadius: 12,
        borderColor: `${color}40`,
        borderWidth: 1,
        backgroundColor: `${color}08`,
        marginVertical: 10,
      }}
    >
      <Type color={color} style={{ fontSize: 12, lineHeight: 19 }}>
        {text}
      </Type>
    </View>
  );
}
export function Loading({ label = 'Getting your latest data…' }: { label?: string }) {
  return (
    <Row style={{ paddingVertical: 24, justifyContent: 'center' }}>
      <ActivityIndicator color={colors.accent} />
      <Type color={colors.muted}>{label}</Type>
    </Row>
  );
}
export function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <View>
      <Message
        text={
          error instanceof Error
            ? error.message
            : 'Could not load this data. Check your connection and retry.'
        }
      />
      <Button variant="secondary" label="Try again" icon="refresh" onPress={retry} />
    </View>
  );
}
export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <Card style={{ gap: 10, alignItems: 'center', paddingVertical: 28 }}>
      <Icon name="receipt" color={colors.muted} size={26} />
      <Type kind="semibold">{title}</Type>
      <Type color={colors.muted} style={{ textAlign: 'center', fontSize: 12, lineHeight: 19 }}>
        {description}
      </Type>
    </Card>
  );
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  input: {
    fontFamily: fonts.body,
    color: colors.fg,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
  },
  separator: { height: 1, backgroundColor: colors.line, marginVertical: 16 },
});
