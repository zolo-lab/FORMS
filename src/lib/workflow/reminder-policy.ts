import { DEFAULT_REMINDER_POLICY, type ReminderPolicy } from "./types";

function num(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "string" && typeof v !== "number") return fallback;
  const n = Number(v);
  if (v === "" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Form values (strings) → a valid ReminderPolicy. */
export function parseReminderPolicy(raw: Record<string, unknown>): ReminderPolicy {
  const d = DEFAULT_REMINDER_POLICY;
  return {
    firstAfterHours: num(raw.firstAfterHours, 1, 720, d.firstAfterHours),
    everyHours: num(raw.everyHours, 1, 720, d.everyHours),
    maxCount: num(raw.maxCount, 0, 10, d.maxCount),
    quietFromHour: num(raw.quietFromHour, 0, 23, d.quietFromHour),
    quietToHour: num(raw.quietToHour, 0, 23, d.quietToHour),
    skipShabbat: raw.skipShabbat === "on" || raw.skipShabbat === true,
  };
}
