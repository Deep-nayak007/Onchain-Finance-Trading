import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Screen, Label, Type, Row, Card, Button, Message, styles } from '../components/ui';
import { colors } from '../theme';
import { useSession } from '../lib/session';
import { useAction } from '../lib/useAction';
import { config } from '../lib/config';
import { gateway } from '../lib/gateway';
import { validAmount } from '../lib/money';
import { requireBindings } from '../integration/team';
import { signPrepared } from '../lib/actions';
import { demoStore } from '../mocks/store';
import { makeReceipt } from '../mocks/fixtures';
import { useApiHealth } from '../lib/queries';
export default function Trade() {
  const { account } = useSession();
  const action = useAction();
  const health = useApiHealth();
  const canExecute =
    config.useMocks || (health.data?.chainId === config.chainId && health.data.live);
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [amount, setAmount] = useState('25');
  const [leverage, setLeverage] = useState(3);
  const book = useQuery({
    queryKey: ['perpl-book'],
    queryFn: () => gateway.book('MON-PERP'),
    refetchInterval: 3000,
  });
  return (
    <Screen back title="Your call." subtitle="Place a manual trade. You review it. You sign it.">
      <Card style={{ gap: 19 }}>
        {!config.useMocks && health.data?.live === false && (
          <Message
            tone="info"
            text="Perpl runs in paper mode. You can follow live prices and your trader’s paper decisions, but manual exchange orders are unavailable until deposits and trade-only enrollment are ready."
          />
        )}
        <Row style={{ justifyContent: 'space-between' }}>
          <Type kind="display" style={{ fontSize: 30 }}>
            MON-PERP
          </Type>
          <Type color={colors.muted} style={{ fontSize: 12 }}>
            {book.data ? `$${book.data.asks[0]?.[0] ?? '—'}` : 'Price pending'}
          </Type>
        </Row>
        <Row>
          {(['LONG', 'SHORT'] as const).map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityState={{ selected: side === s }}
              disabled={action.busy}
              onPress={() => setSide(s)}
              style={{
                flex: 1,
                padding: 14,
                alignItems: 'center',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: side === s ? (s === 'LONG' ? colors.ok : colors.bad) : colors.line,
                backgroundColor:
                  side === s ? `${s === 'LONG' ? colors.ok : colors.bad}15` : colors.bg,
              }}
            >
              <Type
                kind="semibold"
                color={side === s ? (s === 'LONG' ? colors.ok : colors.bad) : colors.muted}
              >
                {s}
              </Type>
            </Pressable>
          ))}
        </Row>
        <Label>Trade size · dollars</Label>
        <TextInput
          accessibilityLabel="Manual trade amount"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          editable={!action.busy}
          maxLength={12}
          style={styles.input}
        />
        <Label>Leverage</Label>
        <Row>
          {[1, 2, 3, 5].map((x) => (
            <Pressable
              key={x}
              accessibilityRole="button"
              disabled={action.busy}
              onPress={() => setLeverage(x)}
              style={{
                flex: 1,
                paddingVertical: 13,
                alignItems: 'center',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: x === leverage ? colors.accent : colors.line,
              }}
            >
              <Type color={x === leverage ? colors.accent : colors.muted}>{x}x</Type>
            </Pressable>
          ))}
        </Row>
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>Estimated initial margin</Label>
          <Type>{validAmount(amount) ? `$${(Number(amount) / leverage).toFixed(2)}` : '—'}</Type>
        </Row>
        <Type color={colors.muted} style={{ fontSize: 11, lineHeight: 19 }}>
          Market order · maximum size $25. Leverage can magnify losses as well as gains.
        </Type>
        <Button
          label={config.useMocks ? 'Place demo trade' : 'Confirm trade with Face ID'}
          icon="face"
          disabled={!account || !validAmount(amount) || !book.data || !canExecute}
          loading={action.busy}
          onPress={() =>
            void action.run(
              async () => {
                if (config.useMocks) {
                  const r = makeReceipt(demoStore.nextSeq++, 'EXECUTED');
                  if (r.detail) {
                    r.detail.intent.side = side;
                    r.detail.intent.sizeUsd = amount;
                    r.detail.intent.leverage = leverage; // Regenerate fingerprints below through the same canonical function.
                    const { keccak256, toBytes } = await import('viem');
                    const { canonicalJSON } = await import('@leash/shared/canonical');
                    r.detail.reasonHash = keccak256(
                      toBytes(
                        canonicalJSON({ intent: r.detail.intent, decision: r.detail.decision }),
                      ),
                    );
                    r.reasonHash = r.detail.reasonHash;
                  }
                  demoStore.receipts.unshift(r);
                  return;
                }
                const tx = await requireBindings().prepareManualOrder(
                  account!,
                  'MON-PERP',
                  side,
                  amount,
                  leverage,
                );
                await signPrepared(account!, tx);
              },
              config.useMocks
                ? 'Demo trade added to receipts. No order was sent.'
                : 'Manual trade confirmed on Monad.',
            )
          }
        />
      </Card>
      <Message text={action.error} />
      <Message text={action.success} tone="success" />
      {action.success && (
        <Button
          variant="secondary"
          label="View receipts"
          icon="receipt"
          onPress={() => router.push('/receipts')}
        />
      )}
      <Message
        tone="info"
        text="Manual trades are your decisions. The AI trader’s rule card does not replace your own review."
      />
    </Screen>
  );
}
