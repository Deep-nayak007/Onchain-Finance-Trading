import type { ExpoConfig } from 'expo/config';
const rpId = process.env.EXPO_PUBLIC_PASSKEY_RP_ID?.trim();
if (rpId && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(rpId)) {
  throw new Error(
    'EXPO_PUBLIC_PASSKEY_RP_ID must be a permanent hostname, without https:// or a path.',
  );
}
const config: ExpoConfig = {
  name: 'LEASH',
  slug: 'leash',
  scheme: 'leash',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'app.leash.mobile',
    supportsTablet: false,
    ...(rpId ? { associatedDomains: [`webcredentials:${rpId}`] } : {}),
    infoPlist: {
      NSFaceIDUsageDescription:
        'Use Face ID to sign your rules, approve slack, and pause your trader.',
    },
  },
  android: {
    package: 'app.leash.mobile',
    ...(rpId
      ? {
          intentFilters: [
            {
              action: 'VIEW',
              autoVerify: true,
              data: [{ scheme: 'https', host: rpId }],
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ],
        }
      : {}),
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-notifications',
    'expo-font',
    ['expo-splash-screen', { backgroundColor: '#0F0D16' }],
    ['expo-build-properties', { ios: { deploymentTarget: '18.0' } }],
  ],
  extra: {
    ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } }
      : {}),
  },
};
export default config;
