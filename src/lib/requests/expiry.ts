/**
 * When the links of a request expire, per package (pure, unit tested).
 *  - days: N days after sending;
 *  - dayOfNextMonth: day N of the month after the date in `dateFieldId` (e.g. the 4th of the month after the start date);
 *    a day past the end of that month becomes its last day; without a valid date, falls back to `fallbackDays` after sending;
 *  - none: never expires.
 * Times are end of day in Asia/Jerusalem (23:59).
 */
export type ExpiryRule =
  | { kind: "days"; days: number }
  | { kind: "dayOfNextMonth"; day: number; dateFieldId: string; fallbackDays?: number }
  | { kind: "none" };

export const DEFAULT_EXPIRY_DAYS = 30;

/** 23:59 Israel time on a calendar date (yyyy, m 1-12, d). Israel is UTC+2 or +3; compute with the zone offset at that date. */
export function endOfDayIsrael(y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, 23, 59, 0));
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour: "numeric", hourCycle: "h23" }).formatToParts(guess);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "1");
  const offsetHours = (hour - 23 + 24) % 24; // Israel hour when UTC is 23:00
  return new Date(guess.getTime() - offsetHours * 3_600_000);
}

function parseDate(v: unknown): { y: number; m: number; d: number } | null {
  if (typeof v !== "string") return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return { y: +iso[1]!, m: +iso[2]!, d: +iso[3]! };
  const il = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v.trim());
  if (il) return { y: +il[3]!, m: +il[2]!, d: +il[1]! };
  return null;
}

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The expiry date for a request sent at `sentAt` with these answers; `null` = no expiry. */
export function expiryFor(rule: ExpiryRule | null | undefined, answers: Record<string, unknown>, sentAt: Date): Date | null {
  const plusDays = (n: number) => new Date(sentAt.getTime() + n * 86_400_000);
  if (!rule) return plusDays(DEFAULT_EXPIRY_DAYS);
  if (rule.kind === "none") return null;
  if (rule.kind === "days") return plusDays(Math.max(1, Math.round(rule.days)));
  const base = parseDate(answers[rule.dateFieldId]);
  if (!base) return plusDays(rule.fallbackDays ?? DEFAULT_EXPIRY_DAYS);
  const y = base.m === 12 ? base.y + 1 : base.y;
  const m = base.m === 12 ? 1 : base.m + 1;
  const d = Math.min(Math.max(1, Math.round(rule.day)), daysIn(y, m));
  return endOfDayIsrael(y, m, d);
}

/** Stored JSON (possibly junk) to a rule, or null for the default. */
export function normalizeExpiryRule(raw: unknown): ExpiryRule | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "none") return { kind: "none" };
  if (o.kind === "days" && Number(o.days) > 0) return { kind: "days", days: Math.round(Number(o.days)) };
  if (o.kind === "dayOfNextMonth" && Number(o.day) >= 1 && typeof o.dateFieldId === "string" && o.dateFieldId) {
    return { kind: "dayOfNextMonth", day: Math.min(31, Math.round(Number(o.day))), dateFieldId: o.dateFieldId, ...(Number(o.fallbackDays) > 0 ? { fallbackDays: Math.round(Number(o.fallbackDays)) } : {}) };
  }
  return null;
}

/** Hebrew description for the package editor and the request page. */
export function describeExpiryRule(rule: ExpiryRule | null | undefined, fieldLabel?: (id: string) => string): string {
  if (!rule) return `${DEFAULT_EXPIRY_DAYS} ימים מהשליחה`;
  if (rule.kind === "none") return "ללא תפוגה";
  if (rule.kind === "days") return `${rule.days} ימים מהשליחה`;
  return `ה-${rule.day} בחודש שאחרי "${fieldLabel?.(rule.dateFieldId) ?? rule.dateFieldId}"`;
}
