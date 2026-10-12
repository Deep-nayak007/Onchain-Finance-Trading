import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';
import {
  Screen,
  Label,
  Type,
  Card,
  Row,
  Message,
  Loading,
  QueryError,
  Button,
} from '../../components/ui';
import { ReceiptPaper } from '../../components/ReceiptPaper';
import { WhyChip } from '../../components/WhyChip';
import { colors } from '../../theme';
import { useSession } from '../../lib/session';
import { api } from '../../lib/api';
import { envio } from '../../lib/envio';
import { verifyReceipt } from '../../lib/verify';
import { config } from '../../lib/config';
import { hashSchema } from '../../lib/schemas';
export default function ReceiptDetailScreen() {
  const { hash } = useLocalSearchParams<{ hash: string }>();
  const { account } = useSession();
  const [tampered, setTampered] = useState(false);
  const validHash = hashSchema.safeParse(hash).success;
  const detail = useQuery({
    queryKey: ['detail', hash],
    queryFn: () => api.receipt(hash),
    enabled: validHash,
  });
  const anchor = useQuery({
    queryKey: ['anchor', account, hash],
    queryFn: () => envio.receipt(account!, hash as Hex),
    enabled: !!account && validHash,
  });
  const data = detail.data
    ? tampered
      ? { ...detail.data, intent: { ...detail.data.intent, sizeUsd: '999' } }
      : detail.data
    : null;
  const verification =
    data && anchor.data ? verifyReceipt(data, anchor.data, config.useMocks) : null;
  return (
    <Screen
      back
      title="The whole story."
      subtitle="A decision, its reasoning, and a fingerprint you can check."
    >
      {!validHash ? (
        <Message text="This receipt link is invalid. Open a receipt from your feed." />
      ) : detail.isPending || anchor.isPending ? (
        <Loading label="Fetching the receipt and its fingerprint…" />
      ) : detail.error || anchor.error ? (
        <QueryError
          error={detail.error ?? anchor.error}
          retry={() => {
            void detail.refetch();
            void anchor.refetch();
          }}
        />
      ) : !data ? (
        <Message
          text="The reasoning is not available yet. Refresh once the trader publishes it."
          tone="info"
        />
      ) : (
        <>
          {anchor.data && <ReceiptPaper receipt={{ ...anchor.data, detail: data }} />}
          <Card style={{ gap: 12, marginTop: 12 }}>
            <Label>On your phone</Label>
            <Message
              tone={
                verification?.state === 'mismatch'
                  ? 'error'
                  : verification?.state === 'verified'
                    ? 'success'
                    : 'info'
              }
              text={
                verification?.label ??
                'The indexer has not found this receipt yet. Verification is pending.'
              }
            />
            <Type color={colors.muted} style={{ fontSize: 12, lineHeight: 19 }}>
              Your phone fingerprints the full intent and decision, then compares it to the receipt
              from the indexer. Changing even one dollar changes the fingerprint.
            </Type>
            {verification?.latencyMs !== null && verification?.latencyMs !== undefined && (
              <Row style={{ justifyContent: 'space-between' }}>
                <Label>Decision → confirmation</Label>
                <Type kind="mono" color={colors.rope}>
                  {(verification.latencyMs / 1000).toFixed(1)} s
                </Type>
              </Row>
            )}
            {config.useMocks && (
              <Button
                variant="secondary"
                label={tampered ? 'Restore sample receipt' : 'Try changing the receipt'}
                onPress={() => setTampered(!tampered)}
              />
            )}
          </Card>
          <View style={{ gap: 10, marginTop: 24 }}>
            <Label>Why your trader chose this</Label>
            <Type style={{ lineHeight: 22, marginBottom: 6 }}>{data.intent.rationale}</Type>
            {data.intent.signals.map((s, i) => (
              <WhyChip key={i} text={`${s.key}: ${s.value}`} source={s.source} />
            ))}
          </View>
          <Card style={{ gap: 12, marginTop: 22 }}>
            <Label>Rules checked</Label>
            <Row style={{ justifyContent: 'space-between' }}>
              <Type color={data.decision.allowed ? colors.ok : colors.bad}>
                {data.decision.allowed ? 'Allowed' : 'Denied'}
              </Type>
              <Type kind="mono" style={{ fontSize: 10 }}>
                Confidence {(data.intent.confidence * 100).toFixed(0)}%
              </Type>
            </Row>
            {data.decision.reasons.map((code) => (
              <Type
                key={code}
                kind="mono"
                color={colors.muted}
                style={{ fontSize: 10, letterSpacing: 0.2 }}
              >
                {code.replaceAll('_', ' ')}
              </Type>
            ))}
            {data.decision.usedSlack && (
              <Message tone="info" text="This trade used the temporary slack you approved." />
            )}
          </Card>
          <View style={{ gap: 12, marginTop: 22 }}>
            <Label>Reasoning fingerprint</Label>
            <Type
              selectable
              kind="mono"
              color={colors.muted}
              style={{ fontSize: 10, lineHeight: 19, letterSpacing: 0.1 }}
            >
              {data.reasonHash}
            </Type>
            <Label>Recomputed here</Label>
            <Type
              selectable
              kind="mono"
              color={verification?.state === 'mismatch' ? colors.bad : colors.muted}
              style={{ fontSize: 10, lineHeight: 19, letterSpacing: 0.1 }}
            >
              {verification?.computedHash ?? 'Waiting for the indexed receipt'}
            </Type>
            {!config.useMocks && data.execTxHash && (
              <Button
                variant="secondary"
                label="View trade on explorer"
                icon="external"
                onPress={() => void Linking.openURL(`https://monadscan.com/tx/${data.execTxHash}`)}
              />
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
