/**
 * Periodic summary of every request that is still open, per organization, to its secretariat (Make's "תזכורת לסיום
 * תהליך קליטת עובד" table). When it runs is set on the trigger: days of the week or days of the month, at an hour
 * (Israel time). Pure, unit tested; the DB side is src/server/open-summary.ts.
 */
import { israelClock } from "@/lib/workflow/reminders";

export const OPEN_SUMMARY_KEY = "open_summary";

export type SummarySchedule = { kind: "weekdays"; days: number[]; hour: number } | { kind: "monthDays"; days: number[]; hour: number };

/** Sunday, Tuesday and Thursday at 07:00 – close to Make's 7 times a month. */
export const DEFAULT_SUMMARY_SCHEDULE: SummarySchedule = { kind: "weekdays", days: [0, 2, 4], hour: 7 };

export const WEEKDAY_NAMES = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/** Day of the month in Israel. */
function israelDayOfMonth(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", day: "numeric" }).format(d));
}

/** True during the scheduled hour on a scheduled day (the cron runs every few minutes; the caller sends once). */
export function isSummaryDue(s: SummarySchedule, now: Date): boolean {
  const c = israelClock(now);
  if (c.hour !== s.hour) return false;
  return s.kind === "weekdays" ? s.days.includes(c.weekday) : s.days.includes(israelDayOfMonth(now));
}

export function describeSchedule(s: SummarySchedule): string {
  const hour = `${String(s.hour).padStart(2, "0")}:00`;
  if (!s.days.length) return "לא נקבעו ימים";
  return s.kind === "weekdays" ? `בימים ${s.days.map((d) => WEEKDAY_NAMES[d]).join(", ")} ב-${hour}` : `ב-${s.days.join(", ")} בכל חודש ב-${hour}`;
}

/** Form fields → schedule: kind, weekday (repeated 0-6), monthDays ("2, 11, 14"), hour (0-23). */
export function parseSchedule(get: (n: string) => string | null, getAll: (n: string) => string[]): SummarySchedule | null {
  const hour = Number(get("hour"));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (get("scheduleKind") === "monthDays") {
    const days = [...new Set((get("monthDays") ?? "").split(/[^\d]+/).filter(Boolean).map(Number))].filter((d) => d >= 1 && d <= 31).sort((a, b) => a - b);
    return days.length ? { kind: "monthDays", days, hour } : null;
  }
  const days = [...new Set(getAll("weekday").map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  return days.length ? { kind: "weekdays", days, hour } : null;
}

export interface OpenItem { subject: string; packageName: string; waitingFor: string; days: number; contact: string }

/** One line per open request, longest waiting first ({{items}} in the text). */
export function openSummaryLines(items: OpenItem[]): string {
  const sorted = [...items].sort((a, b) => b.days - a.days);
  const lines = sorted.slice(0, 80).map((i) => `• ${i.subject}${i.contact ? ` (${i.contact})` : ""} – ${i.packageName} – ממתין ל${i.waitingFor} – ${i.days} ימים`);
  return lines.join("\n") + (sorted.length > 80 ? `\nועוד ${sorted.length - 80} בקשות.` : "");
}
