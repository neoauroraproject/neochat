export interface PushSubscriptionInfo {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface NotificationProvider {
  readonly name: string;
  send(
    subscription: PushSubscriptionInfo,
    payload: PushPayload,
  ): Promise<{ ok: boolean; statusCode?: number }>;
}

/** Phase 2 noop adapter — push notifications are not delivered. */
export class NoopNotificationProvider implements NotificationProvider {
  readonly name = "noop";

  async send(
    _subscription: PushSubscriptionInfo,
    _payload: PushPayload,
  ): Promise<{ ok: boolean; statusCode?: number }> {
    return { ok: false, statusCode: 501 };
  }
}
