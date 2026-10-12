import { View } from 'react-native';
import { Screen, Label, Type, Card } from '../../components/ui';
import { LeashRing } from '../../components/LeashRing';
import { ReceiptPaper } from '../../components/ReceiptPaper';
import { TraderCard } from '../../components/TraderCard';
import { WhyChip } from '../../components/WhyChip';
import { PullLeashButton } from '../../components/PullLeashButton';
import { receiptFixtures, traderFixtures } from '../../mocks/fixtures';
import { colors } from '../../theme';
export default function Components() {
  return (
    <Screen back title="The visual kit.">
      <Card>
        <LeashRing slackLeftUsd="19" weeklyBudgetUsd="50" />
      </Card>
      <View style={{ gap: 16, marginTop: 20 }}>
        {receiptFixtures.map((r) => (
          <ReceiptPaper key={r.id} receipt={r} />
        ))}
        {traderFixtures.map((t) => (
          <TraderCard key={t.persona.id} trader={t} onPress={() => {}} />
        ))}
        <WhyChip text="Smart-money inflows rose this hour." source="Nansen" />
        <PullLeashButton onPull={() => {}} />
        <Label>Design tokens</Label>
        {Object.entries(colors).map(([name, value]) => (
          <View key={name} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: value }} />
            <Type>{name}</Type>
            <Type color={colors.muted}>{value}</Type>
          </View>
        ))}
      </View>
    </Screen>
  );
}
