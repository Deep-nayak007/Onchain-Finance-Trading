import { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { BigShouldersDisplay_800ExtraBold } from '@expo-google-fonts/big-shoulders-display';
import { IBMPlexSans_400Regular, IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans';
import { IBMPlexMono_400Regular, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { colors } from '../theme';
import { SessionProvider } from '../lib/session';
import { Button, Loading, Screen, Type } from '../components/ui';
import { listenForSlack } from '../lib/notifications';
import { TransactionReview } from '../components/TransactionReview';
import { useReducedMotion } from '../lib/useReducedMotion';
import { prepareMockDevClient } from '../mocks/dev-client';
import { config } from '../lib/config';
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1500, refetchOnWindowFocus: true } },
});
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen title="Let’s try again">
      <Type color={colors.muted}>{error.message}</Type>
      <Button label="Reload this screen" onPress={retry} />
    </Screen>
  );
}
export default function RootLayout() {
  useEffect(() => {
    if (config.useMocks) void prepareMockDevClient().catch(() => {});
  }, []);
  const reducedMotion = useReducedMotion();
  const [fontsLoaded, fontError] = useFonts({
    BigShouldersDisplay_800ExtraBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
  });
  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    return listenForSlack();
  }, [fontsLoaded, fontError]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) =>
      focusManager.setFocused(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <View
            style={{
              flex: 1,
              backgroundColor: Platform.OS === 'web' ? '#08070D' : colors.bg,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                flex: 1,
                width: '100%',
                maxWidth: Platform.OS === 'web' ? 460 : undefined,
                backgroundColor: colors.bg,
                ...(Platform.OS === 'web'
                  ? { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line }
                  : {}),
              }}
            >
              <StatusBar style="light" />
              {!fontsLoaded && !fontError ? (
                <Loading label="Uncoiling your leash…" />
              ) : (
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bg },
                    animation: reducedMotion ? 'none' : 'default',
                  }}
                >
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="(onboarding)" />
                  <Stack.Screen name="slack/[id]" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="rules" />
                  <Stack.Screen name="receipt/[hash]" />
                  <Stack.Screen name="trade" />
                  <Stack.Screen name="perpl-setup" />
                  <Stack.Screen name="break-leash" />
                  <Stack.Screen name="dev/components" />
                  <Stack.Screen name="dev/mocks" />
                </Stack>
              )}
              <TransactionReview />
            </View>
          </View>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
