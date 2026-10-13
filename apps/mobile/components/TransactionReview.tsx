import { useSyncExternalStore } from 'react';
import { networkLabel } from '../lib/config';
import { Modal, View } from 'react-native';
import { formatEther } from 'viem';
import { colors } from '../theme';
import { Button, Card, Label, Row, Type } from './ui';
import { finishReview, reviewSnapshot, subscribeReview } from '../lib/transactionReview';
import { useReducedMotion } from '../lib/useReducedMotion';
export function TransactionReview() {
  const review = useSyncExternalStore(subscribeReview, reviewSnapshot, () => null);
  const reducedMotion = useReducedMotion();
  return (
    <Modal
      transparent
      visible={!!review}
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={() => finishReview(false)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: '#000000B8',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        {review && (
          <Card style={{ width: '100%', maxWidth: 410, padding: 24, gap: 20 }}>
            <Label color={colors.rope}>Your signature. Your decision.</Label>
            <Type kind="display" style={{ fontSize: 30 }}>
              REVIEW BEFORE FACE ID
            </Type>
            <Type color={colors.muted} style={{ fontSize: 12, lineHeight: 20 }}>
              Check this transaction against the action you requested. Your passkey signs only after
              you continue.
            </Type>
            <Row style={{ justifyContent: 'space-between' }}>
              <Label>Network</Label>
              <Type>{networkLabel}</Type>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Label>Native value sent</Label>
              <Type>{formatEther(BigInt(review.request.value))} MON sent</Type>
            </Row>
            <Label>Destination</Label>
            <Type selectable kind="mono" style={{ fontSize: 10, lineHeight: 19, letterSpacing: 0 }}>
              {review.request.to}
            </Type>
            <Row style={{ justifyContent: 'space-between' }}>
              <Label>Declared gas limit</Label>
              <Type kind="mono" style={{ fontSize: 10 }}>
                {review.request.gas}
              </Type>
            </Row>
            <Type color={colors.muted} style={{ fontSize: 10, lineHeight: 17 }}>
              The network also charges a gas fee. Monad bills the declared gas limit.
            </Type>
            <Button label="Continue with Face ID" icon="face" onPress={() => finishReview(true)} />
            <Button
              label="Cancel transaction"
              variant="ghost"
              onPress={() => finishReview(false)}
            />
          </Card>
        )}
      </View>
    </Modal>
  );
}
