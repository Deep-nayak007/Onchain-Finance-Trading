import { requireOptionalNativeModule } from 'expo';
export async function prepareMockDevClient(): Promise<void> {
  if (!__DEV__) return;
  // Keep Expo's floating gear from blocking the app's DEMO controls during testing.
  const preferences = requireOptionalNativeModule<{
    setPreferencesAsync: (settings: Record<string, boolean>) => Promise<void>;
  }>('DevMenuPreferences');
  await preferences?.setPreferencesAsync({ showFloatingActionButton: false, showsAtLaunch: false });
  const menu = requireOptionalNativeModule<{ hideMenu: () => Promise<void> }>('ExpoDevMenu');
  await menu?.hideMenu();
}
