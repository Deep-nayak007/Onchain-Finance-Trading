import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  Screen,
  Label,
  Type,
  Row,
  Card,
  Button,
  Message,
  Loading,
  QueryError,
  styles,
} from '../../components/ui';
import { Icon } from '../../components/Icon';
import { colors } from '../../theme';
import { useSession } from '../../lib/session';
import { useAction } from '../../lib/useAction';
import { config } from '../../lib/config';
import { requireBindings } from '../../integration/team';
import { signPrepared } from '../../lib/actions';
import { demoStore } from '../../mocks/store';
import { bookFixture } from '../../mocks/fixtures';
import { validAmount } from '../../lib/money';
type Quote = {
  amountOut: string;
  minOut?: string;
  expiresAt: number;
  transactions: import('../../lib/schemas').TxRequest[];
};
export default function Spot() {
  const { account } = useSession();
  const action = useAction();
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('10');
  const [quote, setQuote] = useState<Quote | null>(null);
  const book = useQuery({
    queryKey: ['spot-book'],
    queryFn: () =>
      config.useMocks ? Promise.resolve(bookFixture) : requireBindings().readSpotBook(),
    refetchInterval: 3000,
  });
  const swapDirection = () => {
    setDirection(direction === 'BUY' ? 'SELL' : 'BUY');
    setAmount(config.useMocks && direction === 'BUY' ? '100' : '10');
    setQuote(null);
    action.clear();
  };
  const valid = validAmount(amount, config.useMocks && direction === 'SELL' ? 500 : 25);
  const noLiquidity =
    !!book.data && (direction === 'BUY' ? book.data.asks : book.data.bids).length === 0;
  return (
    <Screen
      title="A simple swap."
      subtitle="Dollars to MON. MON to dollars. Always your signature."
    >
      <Card style={{ gap: 19 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>You pay</Label>
          <Type color={colors.muted} style={{ fontSize: 11 }}>
            On Kuru
          </Type>
        </Row>
        <Row>
          <TextInput
            accessibilityLabel="Swap amount"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setQuote(null);
              action.clear();
            }}
            editable={!action.busy}
            maxLength={12}
            style={[styles.input, { flex: 1, padding: 10, fontSize: 28 }]}
          />
          <Type kind="display" style={{ fontSize: 23 }}>
            {direction === 'BUY' ? 'DOLLARS' : config.useMocks ? 'MON' : 'DOLLARS OF MON'}
          </Type>
        </Row>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reverse swap direction"
          disabled={action.busy}
          onPress={swapDirection}
          style={{
            alignSelf: 'center',
            backgroundColor: colors.bg,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 12,
            padding: 11,
          }}
        >
          <Icon name="swap" color={colors.accent} />
        </Pressable>
        <Label>You receive · estimated</Label>
        <Row style={{ justifyContent: 'space-between' }}>
          <Type kind="display" style={{ fontSize: 36 }}>
            {quote ? Number(quote.amountOut).toFixed(direction === 'BUY' ? 2 : 4) : '—'}
          </Type>
          <Type kind="display" style={{ fontSize: 23 }}>
            {direction === 'BUY' ? 'MON' : 'DOLLARS'}
          </Type>
        </Row>
        <Type color={colors.muted} style={{ fontSize: 10, lineHeight: 17 }}>
          Review a fresh quote before signing. No automatic swaps.
        </Type>
        {!config.useMocks && direction === 'SELL' && (
          <Type color={colors.muted} style={{ fontSize: 11 }}>
            Enter the dollar value of MON to sell. The API converts it to MON.
          </Type>
        )}
        {quote?.minOut && (
          <Type color={colors.rope} style={{ fontSize: 11 }}>
            Minimum received: {quote.minOut} {direction === 'BUY' ? 'MON' : 'dollars'}
          </Type>
        )}
        <Button
          label="Get a quote"
          variant="secondary"
          icon="refresh"
          loading={action.busy}
          disabled={!valid || !account || noLiquidity}
          onPress={() =>
            void action.run(async () => {
              const next = config.useMocks
                ? {
                    amountOut: String(
                      direction === 'BUY'
                        ? Number(amount) / Number(bookFixture.asks[0]![0])
                        : Number(amount) * Number(bookFixture.bids[0]![0]),
                    ),
                    expiresAt: Date.now() + 30000,
                    transactions: [],
                  }
                : await requireBindings().quoteSwap(account!, amount, direction);
              setQuote(next);
            })
          }
        />
        {noLiquidity && (
          <Message
            tone="info"
            text={
              direction === 'SELL'
                ? 'No buyers are available in this Kuru market. Selling will be available when bids return.'
                : 'No sellers are available in this Kuru market. Buying will be available when asks return.'
            }
          />
        )}
        {quote && (
          <Button
            label={config.useMocks ? 'Confirm demo swap' : 'Swap with Face ID'}
            icon="face"
            loading={action.busy}
            onPress={() =>
              void action.run(
                async () => {
                  if (Date.now() >= quote.expiresAt) {
                    setQuote(null);
                    throw new Error('This quote has expired. Get a fresh quote before signing.');
                  }
                  if (config.useMocks) {
                    if (direction === 'BUY') {
                      if (Number(amount) > Number(demoStore.cashUsd))
                        throw new Error('There are not enough demo dollars for this swap.');
                      demoStore.balanceMon += Number(quote.amountOut);
                      demoStore.cashUsd = String(Number(demoStore.cashUsd) - Number(amount));
                    } else {
                      if (Number(amount) > demoStore.balanceMon)
                        throw new Error('There is not enough demo MON for this swap.');
                      demoStore.balanceMon -= Number(amount);
                      demoStore.cashUsd = String(
                        Number(demoStore.cashUsd) + Number(quote.amountOut),
                      );
                    }
                    setQuote(null);
                    return;
                  }
                  if (!quote.transactions.length)
                    throw new Error(
                      'The swap has no prepared transactions. Ask Brain to check the Kuru helper.',
                    );
                  for (const tx of quote.transactions) {
                    if (Date.now() >= quote.expiresAt)
                      throw new Error(
                        'The quote expired before the next signature. Get a new quote and check confirmed transactions first.',
                      );
                    await signPrepared(account!, tx);
                  }
                  setQuote(null);
                },
                config.useMocks
                  ? 'Demo swap completed. No funds were exchanged.'
                  : 'Your swap confirmed on Monad.',
              )
            }
          />
        )}
        <Type color={colors.muted} style={{ fontSize: 9, textAlign: 'center' }}>
          {config.useMocks
            ? 'Dollars shown as AUSD · sample price in demo mode'
            : config.chainId === 10143
              ? 'Testnet dollars shown as test USDC · Kuru MON/USDC'
              : 'Dollars shown as AUSD · Kuru MON/AUSD'}
        </Type>
      </Card>
      <Message text={action.error} />
      <Message text={action.success} tone="success" />
      <View style={{ marginTop: 27, gap: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>Order-book depth</Label>
          <Label>
            {!config.useMocks && config.chainId === 10143 ? 'MON / USDC' : 'MON / AUSD'}
          </Label>
        </Row>
        {book.isPending ? (
          <Loading />
        ) : book.error ? (
          <QueryError error={book.error} retry={() => void book.refetch()} />
        ) : (
          book.data && (
            <Card style={{ gap: 14 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Label color={colors.ok}>Bids</Label>
                <Label>Price / size</Label>
                <Label color={colors.bad}>Asks</Label>
              </Row>
              {Array.from(
                { length: Math.max(book.data.bids.length, book.data.asks.length) },
                (_, i) => (
                  <Row key={i} style={{ justifyContent: 'space-between' }}>
                    <View
                      style={{
                        flex: 1,
                        paddingVertical: 9,
                        backgroundColor: `${colors.ok}08`,
                        paddingHorizontal: 8,
                      }}
                    >
                      <Type
                        kind="mono"
                        color={colors.ok}
                        style={{ fontSize: 10, letterSpacing: 0 }}
                      >
                        {book.data!.bids[i]?.[0] ?? '—'}
                      </Type>
                      <Type
                        kind="mono"
                        color={colors.muted}
                        style={{ fontSize: 9, letterSpacing: 0, marginTop: 4 }}
                      >
                        {book.data!.bids[i]?.[1] ?? ''}
                      </Type>
                    </View>
                    <View
                      style={{
                        flex: 1,
                        alignItems: 'flex-end',
                        paddingVertical: 9,
                        backgroundColor: `${colors.bad}08`,
                        paddingHorizontal: 8,
                      }}
                    >
                      <Type
                        kind="mono"
                        color={colors.bad}
                        style={{ fontSize: 10, letterSpacing: 0 }}
                      >
                        {book.data!.asks[i]?.[0] ?? '—'}
                      </Type>
                      <Type
                        kind="mono"
                        color={colors.muted}
                        style={{ fontSize: 9, letterSpacing: 0, marginTop: 4 }}
                      >
                        {book.data!.asks[i]?.[1] ?? ''}
                      </Type>
                    </View>
                  </Row>
                ),
              )}
            </Card>
          )
        )}
      </View>
    </Screen>
  );
}
