// Expo push. Payloads (agreed with Face): { type: "slack", id } and { type: "deposit", amount, token }.
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import type { Store } from "../store/db";

export type PushPayload = { type: "slack"; id: string } | { type: "deposit"; amount: string; token: string };

export interface Pusher {
  send(account: string, title: string, body: string, data: PushPayload): Promise<number>;
}

export class ExpoPusher implements Pusher {
  private readonly expo = new Expo();
  constructor(private readonly store: Store) {}

  async send(account: string, title: string, body: string, data: PushPayload): Promise<number> {
    const tokens = this.store.devices(account).filter((t) => Expo.isExpoPushToken(t));
    if (!tokens.length) return 0;
    const messages: ExpoPushMessage[] = tokens.map((to) => ({ to, title, body, data, sound: "default", priority: "high" }));
    let sent = 0;
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        sent += tickets.filter((t) => t.status === "ok").length;
      } catch (e) {
        console.warn(`[push] send failed: ${(e as Error).message}`);
      }
    }
    return sent;
  }
}

/** For tests and when nobody is registered. */
export class MemoryPusher implements Pusher {
  readonly sent: { account: string; title: string; body: string; data: PushPayload }[] = [];
  async send(account: string, title: string, body: string, data: PushPayload) {
    this.sent.push({ account, title, body, data });
    return 1;
  }
}
