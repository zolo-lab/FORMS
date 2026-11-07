/**
 * When the links of a request expire, per package (pure, unit tested).
 *  - days: N days after sending;
 *  - dayOfNextMonth: day N of the month after the date in `dateFieldId` (e.g. the 4th of the month after the start date);
 *    a day past the end of that month becomes its last day; without a valid date, falls back to `fallbackDays` after sending;
 *  - dayOfMonth: day N on or after the date: the same month when the date is up to day N, otherwise the next month
 *    (Make's rule for Shivat Zion: the 20th);
 *  - none: never expires.
 * Times are end of day in Asia/Jerusalem (23:59).
 */
export type ExpiryRule =
  | { kind: "days"; days: number }
  | { kind: "dayOfNextMonth"; day: number; dateFieldId: string; fallbackDays?: number }
  | { kind: "dayOfMonth"; day: number; dateFieldId: string; fallbackDays?: number }
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
  const want = Math.max(1, Math.round(rule.day));
  // dayOfMonth stays in the date's own month while the date is not past day N.
  const next = rule.kind === "dayOfNextMonth" || base.d > want;
  const y = next && base.m === 12 ? base.y + 1 : base.y;
  const m = next ? (base.m === 12 ? 1 : base.m + 1) : base.m;
  return endOfDayIsrael(y, m, Math.min(want, daysIn(y, m)));
}

/** Stored JSON (possibly junk) to a rule, or null for the default. */
export function normalizeExpiryRule(raw: unknown): ExpiryRule | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "none") return { kind: "none" };
  if (o.kind === "days" && Number(o.days) > 0) return { kind: "days", days: Math.round(Number(o.days)) };
  if ((o.kind === "dayOfNextMonth" || o.kind === "dayOfMonth") && Number(o.day) >= 1 && typeof o.dateFieldId === "string" && o.dateFieldId) {
    return { kind: o.kind, day: Math.min(31, Math.round(Number(o.day))), dateFieldId: o.dateFieldId, ...(Number(o.fallbackDays) > 0 ? { fallbackDays: Math.round(Number(o.fallbackDays)) } : {}) };
  }
  return null;
}

/** Hebrew description for the package editor and the request page. */
export function describeExpiryRule(rule: ExpiryRule | null | undefined, fieldLabel?: (id: string) => string): string {
  if (!rule) return `${DEFAULT_EXPIRY_DAYS} ימים מהשליחה`;
  if (rule.kind === "none") return "ללא תפוגה";
  if (rule.kind === "days") return `${rule.days} ימים מהשליחה`;
  const field = fieldLabel?.(rule.dateFieldId) ?? rule.dateFieldId;
  if (rule.kind === "dayOfMonth") return `ה-${rule.day} בחודש לפי "${field}" (אותו חודש עד ה-${rule.day}, אחרת החודש הבא)`;
  return `ה-${rule.day} בחודש שאחרי "${field}"`;
}

/** A step's link rule: its organization's exception, else its own; null = the step follows the request's expiry. */
export function stepExpiryRule(step: { expiry?: ExpiryRule; expiryByOrg?: Record<string, ExpiryRule> }, organizationId: string | null | undefined): ExpiryRule | null {
  return (organizationId ? step.expiryByOrg?.[organizationId] : undefined) ?? step.expiry ?? null;
}

/** A step's link never ends sooner than this after the step starts (a past start date would otherwise kill it at once). */
export const MIN_STEP_LINK_DAYS = 3;

/** The deadline of a step's link from its own rule, counted from when the step starts; null = never. */
export function stepLinkDeadline(rule: ExpiryRule, answers: Record<string, unknown>, startedAt: Date): Date | null {
  const at = expiryFor(rule, answers, startedAt);
  if (!at) return null;
  const floor = new Date(startedAt.getTime() + MIN_STEP_LINK_DAYS * 86_400_000);
  return at < floor ? floor : at;
}

/** When a step's one-time link stops working: its own deadline when it has a rule, else the request's. */
export function linkExpiryOf(step: { ownLinkExpiry: boolean; linkExpiresAt: Date | null }, request: { expiresAt: Date | null }): Date | null {
  return step.ownLinkExpiry ? step.linkExpiresAt : request.expiresAt;
}

/** Org id → rule, from stored JSON (junk dropped). */
export function normalizeExpiryByOrg(raw: unknown): Record<string, ExpiryRule> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, ExpiryRule> = {};
  for (const [org, r] of Object.entries(raw as Record<string, unknown>)) {
    const rule = normalizeExpiryRule(r);
    if (rule && /^[0-9a-f-]{36}$/i.test(org)) out[org] = rule;
  }
  return Object.keys(out).length ? out : undefined;
}
