import { config } from './config';
export function listenForSlack() {
  return () => {};
}
export async function registerPush(_account: string) {
  return config.useMocks
    ? 'Demo requests are available in Home.'
    : 'Push notifications need a physical phone. Slack requests still appear in Home.';
}
