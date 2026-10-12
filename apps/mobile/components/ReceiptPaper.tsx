import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts } from '../theme';
import { Type, Row } from './ui';
import type { IndexedReceipt, ReceiptStatus } from '../lib/schemas';
import { verifyReceipt } from '../lib/verify';
import { config } from '../lib/config';
const stampColors: Record<ReceiptStatus, string> = {
  EXECUTED: colors.stampOk,
  REJECTED: colors.stampBad,
  FAILED: colors.stampBad,
  PAUSED: colors.stampPause,
  SHADOW: colors.stampShadow,
};
export function Stamp({ status, paper = false }: { status: ReceiptStatus; paper?: boolean }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderWidth: 2,
        borderColor: stampColors[status],
        paddingHorizontal: 8,
        paddingVertical: 4,
        transform: [{ rotate: '-6deg' }],
      }}
    >
      <Type
        kind="mono"
        color={stampColors[status]}
        style={{ fontSize: 11, fontFamily: fonts.monoBold, letterSpacing: 2 }}
      >
        {paper && status === 'EXECUTED' ? 'PAPER' : status === 'REJECTED' ? 'DENIED' : status}
      </Type>
    </View>
  );
}
export function ReceiptPaper({
  receipt,
  onPress,
  compact = false,
}: {
  receipt: IndexedReceipt;
  onPress?: () => void;
  compact?: boolean;
}) {
  const detail = receipt.detail;
  const paper = !config.useMocks && !!detail && detail.execTxHash === null;
  const verification = detail ? verifyReceipt(detail, receipt, config.useMocks) : null;
  const label =
    receipt.status === 'PAUSED'
      ? 'Your trader is paused'
      : detail
        ? `${detail.intent.side} ${detail.intent.market.replace('-PERP', '')}`
        : `${receipt.persona.toUpperCase()} · ${receipt.status}`;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${receipt.persona}, ${receipt.status}, receipt ${receipt.seq}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, marginBottom: 12 })}
    >
      <View
        style={{
          backgroundColor: colors.paper,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
          padding: compact ? 14 : 18,
          gap: 11,
        }}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Type kind="mono" color={colors.paperMuted} style={{ fontSize: 9, letterSpacing: 0.8 }}>
            {receipt.persona.toUpperCase()} · #{String(receipt.seq).padStart(4, '0')}
          </Type>
          <Type kind="mono" color={colors.paperMuted} style={{ fontSize: 9, letterSpacing: 0 }}>
            {new Date(receipt.createdAt).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: 'America/Phoenix',
            })}
          </Type>
        </Row>
        <View
          style={{ borderBottomWidth: 1, borderStyle: 'dashed', borderColor: colors.paperLine }}
        />
        <Row style={{ justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 5 }}>
            <Type
              kind="mono"
              color={colors.paperInk}
              style={{ fontFamily: fonts.monoBold, fontSize: 13, letterSpacing: 0.3 }}
            >
              {label}
            </Type>
            {detail && (
              <Type
                kind="mono"
                color={colors.paperMuted}
                style={{ fontSize: 10, letterSpacing: 0 }}
              >
                ${detail.intent.sizeUsd} · {detail.intent.leverage}x · {detail.intent.venue}
              </Type>
            )}
          </View>
          <Stamp status={receipt.status} paper={paper} />
        </Row>
        {paper && (
          <Type kind="mono" color={colors.paperMuted} style={{ fontSize: 9, letterSpacing: 0 }}>
            PAPER · No trade was executed
          </Type>
        )}
        <Type
          kind="mono"
          color={colors.paperMuted}
          numberOfLines={compact ? 2 : 3}
          style={{ fontSize: 10, letterSpacing: 0, lineHeight: 16 }}
        >
          Why:{' '}
          {receipt.pauseReason
            ? `Paused by ${receipt.pauseReason}. Only you can resume.`
            : (detail?.intent.rationale ?? 'Open this receipt to fetch the full reasoning.')}
        </Type>
        <View
          style={{ borderBottomWidth: 1, borderStyle: 'dashed', borderColor: colors.paperLine }}
        />
        <Type
          kind="mono"
          color={
            verification?.state === 'mismatch'
              ? colors.stampBad
              : verification?.state === 'verified'
                ? colors.stampOk
                : receipt.status === 'REJECTED'
                  ? colors.stampPause
                  : colors.paperMuted
          }
          style={{ fontSize: 9, letterSpacing: 0, lineHeight: 15 }}
        >
          {verification?.label ??
            (receipt.status === 'PAUSED'
              ? 'Leash pulled · trading stopped'
              : 'Open to check the onchain fingerprint')}
          {detail?.decision.usedSlack ? '\nTemporary slack used · expires on its own' : ''}
        </Type>
      </View>
      <Svg width="100%" height={8} viewBox="0 0 400 8" preserveAspectRatio="none">
        <Path
          d={`M0 0 H400 V0 ${Array.from({ length: 40 }, (_, i) => `L${400 - i * 10 - 5} 8 L${390 - i * 10} 0`).join(' ')} Z`}
          fill={colors.paper}
        />
      </Svg>
    </Pressable>
  );
}
