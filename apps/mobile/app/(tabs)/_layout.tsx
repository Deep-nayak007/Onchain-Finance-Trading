import { Platform } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { colors, fonts } from '../../theme';
import { Icon, type IconName } from '../../components/Icon';
import { useSession } from '../../lib/session';
export default function TabsLayout() {
  const { account } = useSession();
  if (!account) return <Redirect href="/welcome" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          height: Platform.OS === 'web' ? 74 : 87,
          paddingTop: 12,
          paddingBottom: Platform.OS === 'web' ? 14 : 25,
        },
        tabBarLabelStyle: { fontFamily: fonts.body, fontSize: 10, marginTop: 5 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {[
        { name: 'home', title: 'Home', icon: 'home' },
        { name: 'receipts', title: 'Receipts', icon: 'receipt' },
        { name: 'risk', title: 'Risk', icon: 'risk' },
        { name: 'traders', title: 'Traders', icon: 'traders' },
        { name: 'spot', title: 'Spot', icon: 'swap' },
      ].map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color }) => (
              <Icon
                name={t.icon as IconName}
                color={typeof color === 'string' ? color : colors.muted}
                size={21}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
