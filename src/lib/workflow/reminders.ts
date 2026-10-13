/** Reminder timing (pure). Israel time; quiet hours may cross midnight; Shabbat is skipped when asked. */
import type { ReminderPolicy } from "./types";

const TZ = "Asia/Jerusalem";

/** Weekday (0 = Sunday) and hour/minute of an instant on the Israeli clock. */
export function israelClock(d: Date): { weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, hour: Number(get("hour")), minute: Number(get("minute")) };
}

/** Friday 15:00 until Saturday 21:00 (a fixed approximation of candle lighting to havdalah). */
export function isShabbat(d: Date): boolean {
  const { weekday, hour } = israelClock(d);
  return (weekday === 5 && hour >= 15) || (weekday === 6 && hour < 21);
}

export function isQuietHour(d: Date, policy: Pick<ReminderPolicy, "quietFromHour" | "quietToHour">): boolean {
  const { hour } = israelClock(d);
  const { quietFromHour: from, quietToHour: to } = policy;
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

export function canSendReminderNow(d: Date, policy: ReminderPolicy): boolean {
  return !isQuietHour(d, policy) && !(policy.skipShabbat && isShabbat(d));
}

export interface ReminderState {
  /** When the step was activated. */
  activatedAt: Date;
  sent: number;
  lastSentAt: Date | null;
}

/** True when a reminder should go out at `now`: not past the cap, the wait has elapsed and it isn't a quiet time. */
export function reminderDue(state: ReminderState, policy: ReminderPolicy, now: Date): boolean {
  if (state.sent >= policy.maxCount) return false;
  const base = state.sent === 0 || !state.lastSentAt ? state.activatedAt.getTime() + policy.firstAfterHours * 3_600_000 : state.lastSentAt.getTime() + policy.everyHours * 3_600_000;
  if (now.getTime() < base) return false;
  return canSendReminderNow(now, policy);
}
