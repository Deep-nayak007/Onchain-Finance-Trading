import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Row, Type, Label, Loading, QueryError, Empty } from '../../components/ui';
import { ReceiptPaper } from '../../components/ReceiptPaper';
import { colors } from '../../theme';
import { useReceipts } from '../../lib/queries';
export default function Receipts() {
  const query = useReceipts();
  const [filter, setFilter] = useState('All');
  const rows =
    query.data
      ?.filter(
        (r) =>
          filter === 'All' ||
          (filter === 'Denied'
            ? r.status === 'REJECTED' || r.status === 'FAILED'
            : r.status === filter.toUpperCase()),
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) ?? [];
  return (
    <Screen title="Nothing to hide." subtitle="Every decision leaves a receipt. Even a no.">
      <Row style={{ gap: 7, marginBottom: 24 }}>
        {['All', 'Executed', 'Denied', 'Shadow'].map((f) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f }}
            key={f}
            onPress={() => setFilter(f)}
            style={{
              paddingHorizontal: 13,
              paddingVertical: 9,
              borderRadius: 100,
              backgroundColor: filter === f ? colors.accent : colors.surface,
              borderColor: filter === f ? colors.accent : colors.line,
              borderWidth: 1,
            }}
          >
            <Type color={filter === f ? colors.bg : colors.muted} style={{ fontSize: 11 }}>
              {f}
            </Type>
          </Pressable>
        ))}
      </Row>
      <Row style={{ justifyContent: 'space-between', marginBottom: 13 }}>
        <Label>Your trader’s paper trail</Label>
        <Label>{rows.length} receipts</Label>
      </Row>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <QueryError error={query.error} retry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          title="No receipts yet"
          description="Every executed, denied, and shadow decision will appear here."
        />
      ) : (
        rows.map((r) => (
          <ReceiptPaper
            key={r.id}
            receipt={r}
            onPress={r.reasonHash ? () => router.push(`/receipt/${r.reasonHash}`) : undefined}
          />
        ))
      )}
      <View style={{ alignItems: 'center', gap: 8, marginTop: 16 }}>
        <Type kind="mono" color={colors.muted} style={{ fontSize: 9 }}>
          END OF ROLL · FOR NOW
        </Type>
        <Type color={colors.muted} style={{ fontSize: 11 }}>
          Your phone checks the fingerprint. You check the why.
        </Type>
      </View>
    </Screen>
  );
}
