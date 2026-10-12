import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { z } from 'zod';
import { config } from './config';
import { api } from './api';
const payload = z.object({ type: z.literal('slack'), id: z.uuid() });
export function listenForSlack() {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = payload.safeParse(response.notification.request.content.data);
    if (data.success) router.push(`/slack/${data.data.id}`);
  });
  return () => sub.remove();
}
export async function registerPush(account: string): Promise<string> {
  if (config.useMocks) return 'Demo requests are available in Home.';
  if (Platform.OS === 'web' || !Device.isDevice)
    return 'Push notifications need a physical phone. Slack requests still appear in Home.';
  if (!config.easProjectId)
    return 'Push notifications are not configured yet. Slack requests still appear in Home.';
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Slack requests',
      importance: Notifications.AndroidImportance.HIGH,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted')
    return 'Notifications are off. Review slack requests in Home whenever you like.';
  const token = await Notifications.getExpoPushTokenAsync({ projectId: config.easProjectId });
  await api.registerDevice(account, token.data);
  return 'Your phone will receive slack requests.';
}
