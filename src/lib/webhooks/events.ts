/** Which workflow events are exposed as webhooks. */
export const WEBHOOK_EVENTS = ["request.completed", "step.completed", "request.declined"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "request.completed": "הבקשה הושלמה",
  "step.completed": "שלב הושלם",
  "request.declined": "הבקשה נדחתה",
};

const MAP: Record<string, WebhookEvent> = {
  request_completed: "request.completed",
  step_completed: "step.completed",
  request_declined: "request.declined",
};

/** Engine event type → public webhook event (null when it isn't exposed). */
export function toWebhookEvent(engineType: string): WebhookEvent | null {
  return MAP[engineType] ?? null;
}

export function parseEvents(values: string[]): WebhookEvent[] {
  return values.filter((v): v is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(v));
}

/** Retry schedule: attempt now, then after 2 s and 5 s. */
export const RETRY_DELAYS_MS = [0, 2000, 5000] as const;

export function isSafeWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    return !(h === "localhost" || h.endsWith(".localhost") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "[::1]");
  } catch {
    return false;
  }
}
