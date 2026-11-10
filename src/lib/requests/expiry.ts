/**
 * When a link stops working (pure, unit tested). One general rule, read as a sentence:
 *   start from  [the request being sent | the step starting | the date in a field]
 *   add         [N days] and/or [M months]
 *   round to    [no rounding | day D: this month if not past it, else the next | day D of the next month]
 * Make's rules are presets of it: "the 7th of the month after the start date" = from the field, round to day 7 of the
 * next month; Shivat Zion's "the 20th" = from the field, round to day 20 this month or the next.
 * A date from a field, or a rounded date, ends at 23:59 Israel time; "N days after sending" keeps the exact time.
 * Without a valid date in the field, the deadline is `fallbackDays` after sending (default 30).
 * Conditions choose between rules ("cases"): if [a date field of the form] [is / is not] [today, before or after
 * today, this / next / last week, month, quarter or year, within the next or last N days, on / before / after a given
 * date, up to / after day D of its month, empty] (and more such lines) then [a rule], …, otherwise [a rule]. The first
 * case whose lines all hold decides; a line on a missing date does not hold (but "empty" does). "Today" is the current
 * day, and a later step may fill a date: a rule with cases is worked out again as the days pass (`comparesToday`), so
 * its deadline can move.
 */
export type ExpiryBase = { from: "sent" } | { from: "stepStart" } | { from: "field"; fieldId: string };
export type ExpirySnap = { day: number; mode: "sameOrNext" | "next" | "same" };
export type ExpiryCalc = { kind: "calc"; base: ExpiryBase; addDays?: number; addMonths?: number; snap?: ExpirySnap; fallbackDays?: number };
/** A rule that is not a choice between rules. */
export type ExpiryOutcome = { kind: "none" } | ExpiryCalc;
/**
 * The date operators, as in Tadabase's filters (same names, same order), plus the day of the month:
 * today · this / last / next week, month, quarter, year (and their negations) · a rolling range · a given date or
 * another date field · blank.
 */
export const COND_OPS = [
  "today", "notToday", "beforeToday", "afterToday", "todayOrBefore", "todayOrAfter",
  "thisWeek", "notThisWeek", "thisMonth", "notThisMonth", "thisQuarter", "notThisQuarter", "thisYear", "notThisYear",
  "lastWeek", "notLastWeek", "lastMonth", "notLastMonth", "lastQuarter", "notLastQuarter", "lastYear", "notLastYear",
  "nextWeek", "notNextWeek", "nextMonth", "notNextMonth", "nextQuarter", "notNextQuarter", "nextYear", "notNextYear",
  "duringCurrent", "duringPrevious", "duringNext", "beforePrevious", "afterNext",
  "is", "isNot", "before", "after", "onOrBefore", "onOrAfter",
  "blank", "notBlank",
  "dayLte", "dayGt",
] as const;
export type CondOp = (typeof COND_OPS)[number];
export const COND_UNITS = ["days", "weeks", "months", "years"] as const;
export type CondUnit = (typeof COND_UNITS)[number];
export const COND_PERIODS = ["week", "month", "quarter", "year"] as const;
export type CondPeriod = (typeof COND_PERIODS)[number];
/** What an operator takes: a period, a number with a unit, a date (given, or another field), a day of the month. */
export const condNeeds = (op: CondOp): "period" | "span" | "date" | "day" | null =>
  op === "duringCurrent" ? "period"
    : op === "duringPrevious" || op === "duringNext" || op === "beforePrevious" || op === "afterNext" ? "span"
      : op === "is" || op === "isNot" || op === "before" || op === "after" || op === "onOrBefore" || op === "onOrAfter" ? "date"
        : op === "dayLte" || op === "dayGt" ? "day" : null;
/** `date`: a given day (yyyy-mm-dd), or `otherFieldId`: another date field of the form, for the "date" operators. */
export type ExpiryCondition = { fieldId: string; op: CondOp; n?: number; unit?: CondUnit; period?: CondPeriod; date?: string; otherFieldId?: string };
/** A group of conditions: all of them have to hold, or (`match: "any"`) at least one. */
export type ExpiryCase = { match?: "any"; conditions: ExpiryCondition[]; then: ExpiryOutcome };
export const caseConditions = (c: ExpiryCase): ExpiryCondition[] => c.conditions;
/**
 * "פג כאשר": the link expires on the first day the condition holds – one filter row, as in Tadabase / Airtable
 * ("[date field] [is before today | is next month | …] [value]"). Checked again every day.
 */
export type ExpiryWhen = { kind: "when"; condition: ExpiryCondition };
export type ExpiryRule = ExpiryOutcome | ExpiryWhen | { kind: "cases"; cases: ExpiryCase[]; otherwise: ExpiryOutcome };

/** Rules stored before the general rule existed; read through `normalizeExpiryRule`. */
type LegacyRule =
  | { kind: "days"; days: number }
  | { kind: "dayOfNextMonth" | "dayOfMonth"; day: number; dateFieldId: string; fallbackDays?: number };

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

const addMonths = (y: number, m: number, d: number, n: number) => {
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return { y: ny, m: nm, d: Math.min(d, daysIn(ny, nm)) };
};

/** Calendar date (Israel) of an instant. */
function israelDate(at: Date): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(at).split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

/**
 * The deadline for a rule. `at.sent` = when the request was sent (created); `at.start` = when the step started (the
 * same as `sent` for the request's own deadline). `null` = no expiry; a missing rule = 30 days after sending.
 */
export function expiryFor(raw: ExpiryRule | LegacyRule | null | undefined, answers: Record<string, unknown>, at: Date | { sent: Date; start?: Date; today?: Date }): Date | null {
  const sent = at instanceof Date ? at : at.sent;
  const start = at instanceof Date ? at : (at.start ?? at.sent);
  const today = at instanceof Date ? at : (at.today ?? start);
  const plusDays = (from: Date, n: number) => new Date(from.getTime() + n * 86_400_000);
  if (raw === null || raw === undefined) return plusDays(sent, DEFAULT_EXPIRY_DAYS);
  const normalized = normalizeExpiryRule(raw);
  if (!normalized) return plusDays(sent, DEFAULT_EXPIRY_DAYS);
  if (normalized.kind === "when") return whenDeadline(normalized.condition, answers, today);
  const rule = normalized.kind === "cases" ? (normalized.cases.find((c) => caseHolds(c, answers, today))?.then ?? normalized.otherwise) : normalized;
  if (rule.kind === "none") return null;
  const days = Math.round(rule.addDays ?? 0);
  const months = Math.round(rule.addMonths ?? 0);

  let date: { y: number; m: number; d: number };
  if (rule.base.from === "field") {
    const fromField = parseDate(answers[rule.base.fieldId]);
    // No date to count from: a number of days from the start (the step's, or the sending for the request).
    if (!fromField) return plusDays(start, rule.fallbackDays ?? DEFAULT_EXPIRY_DAYS);
    date = fromField;
  } else {
    const instant = rule.base.from === "sent" ? sent : start;
    // A plain "N days after" keeps the time of day; anything calendar-based ends at 23:59.
    if (!rule.snap && !months) return plusDays(instant, Math.max(days, 0));
    date = israelDate(instant);
  }
  if (months) date = addMonths(date.y, date.m, date.d, months);
  if (days) {
    const t = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
    date = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  if (rule.snap) {
    const want = Math.min(31, Math.max(1, Math.round(rule.snap.day)));
    // "same": that day of the same month even if it already passed; "sameOrNext": the next such day; "next": next month.
    const next = rule.snap.mode === "next" || (rule.snap.mode === "sameOrNext" && date.d > want);
    const target = next ? addMonths(date.y, date.m, 1, 1) : { y: date.y, m: date.m, d: 1 };
    date = { y: target.y, m: target.m, d: Math.min(want, daysIn(target.y, target.m)) };
  }
  return endOfDayIsrael(date.y, date.m, date.d);
}

/** A condition on the current date itself ("אם היום הוא עד ה-20 בחודש"), not on a field of the form. */
export const TODAY_FIELD = "__today";

/** Days since 1970 of a calendar date, and Sunday-based week / month / quarter / year counters for comparing periods. */
const dayNo = (d: { y: number; m: number; d: number }) => Math.round(Date.UTC(d.y, d.m - 1, d.d) / 86_400_000);
const weekNo = (d: { y: number; m: number; d: number }) => Math.floor((dayNo(d) + 4) / 7); // 1970-01-01 was a Thursday
const monthNo = (d: { y: number; m: number }) => d.y * 12 + d.m - 1;
const quarterNo = (d: { y: number; m: number }) => d.y * 4 + Math.floor((d.m - 1) / 3);

type Ymd = { y: number; m: number; d: number };
/** A date moved by n units (calendar months and years; a missing day falls back to the month's last). */
function shift(t: Ymd, n: number, unit: CondUnit): Ymd {
  if (unit === "days" || unit === "weeks") {
    const d = new Date(Date.UTC(t.y, t.m - 1, t.d + n * (unit === "weeks" ? 7 : 1)));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  const months = t.y * 12 + (t.m - 1) + n * (unit === "years" ? 12 : 1);
  const y = Math.floor(months / 12);
  const m = (months % 12) + 1;
  return { y, m, d: Math.min(t.d, new Date(Date.UTC(y, m, 0)).getUTCDate()) };
}
const NEGATED: Partial<Record<CondOp, CondOp>> = {
  notToday: "today", notThisWeek: "thisWeek", notThisMonth: "thisMonth", notThisQuarter: "thisQuarter", notThisYear: "thisYear",
  notLastWeek: "lastWeek", notLastMonth: "lastMonth", notLastQuarter: "lastQuarter", notLastYear: "lastYear",
  notNextWeek: "nextWeek", notNextMonth: "nextMonth", notNextQuarter: "nextQuarter", notNextYear: "nextYear", isNot: "is",
};

/**
 * Whether a condition holds on `now` – the current day. A missing date holds only for "blank" (so neither
 * "is this month" nor "is not this month" holds for it: nothing is known).
 */
export function holds(c: ExpiryCondition, answers: Record<string, unknown>, now: Date): boolean {
  const t = israelDate(now);
  const date = c.fieldId === TODAY_FIELD ? t : parseDate(answers[c.fieldId]);
  if (c.op === "blank") return date === null;
  if (c.op === "notBlank") return date !== null;
  if (!date) return false;
  const positive = NEGATED[c.op];
  if (positive) return !holds({ ...c, op: positive }, answers, now);
  const day = dayNo(date);
  const today = dayNo(t);
  const n = c.n ?? 0;
  const unit = c.unit ?? "days";
  const period = (shiftBy: number, p: CondPeriod) =>
    p === "week" ? weekNo(date) === weekNo(t) + shiftBy : p === "month" ? monthNo(date) === monthNo(t) + shiftBy : p === "quarter" ? quarterNo(date) === quarterNo(t) + shiftBy : date.y === t.y + shiftBy;
  const given = c.otherFieldId ? parseDate(answers[c.otherFieldId]) : parseDate(c.date);
  switch (c.op) {
    case "today": return day === today;
    case "beforeToday": return day < today;
    case "afterToday": return day > today;
    case "todayOrBefore": return day <= today;
    case "todayOrAfter": return day >= today;
    case "thisWeek": return period(0, "week");
    case "thisMonth": return period(0, "month");
    case "thisQuarter": return period(0, "quarter");
    case "thisYear": return period(0, "year");
    case "lastWeek": return period(-1, "week");
    case "lastMonth": return period(-1, "month");
    case "lastQuarter": return period(-1, "quarter");
    case "lastYear": return period(-1, "year");
    case "nextWeek": return period(1, "week");
    case "nextMonth": return period(1, "month");
    case "nextQuarter": return period(1, "quarter");
    case "nextYear": return period(1, "year");
    case "duringCurrent": return period(0, c.period ?? "month");
    // Rolling ranges, today included: the last / next N days, weeks, months or years.
    case "duringPrevious": return day <= today && day >= dayNo(shift(t, -n, unit));
    case "duringNext": return day >= today && day <= dayNo(shift(t, n, unit));
    case "beforePrevious": return day < dayNo(shift(t, -n, unit));
    case "afterNext": return day > dayNo(shift(t, n, unit));
    case "is": return !!given && day === dayNo(given);
    case "before": return !!given && day < dayNo(given);
    case "after": return !!given && day > dayNo(given);
    case "onOrBefore": return !!given && day <= dayNo(given);
    case "onOrAfter": return !!given && day >= dayNo(given);
    case "dayLte": return date.d <= n;
    case "dayGt": return date.d > n;
    default: return false;
  }
}

/**
 * The deadline of "פג כאשר": the end of the day before the first day (from `today`, up to 10 years on) on which the
 * condition holds – already past when it holds today; null when it never does (or a date it reads is still missing,
 * and then it is worked out again when the sweep runs).
 */
function whenDeadline(c: ExpiryCondition, answers: Record<string, unknown>, today: Date): Date | null {
  const t = israelDate(today);
  for (let i = 0; i <= 3660; i++) {
    const day = shift(t, i, "days");
    if (holds(c, answers, new Date(Date.UTC(day.y, day.m - 1, day.d, 10)))) {
      const before = shift(day, -1, "days");
      return endOfDayIsrael(before.y, before.m, before.d);
    }
  }
  return null;
}

/** Whether a group holds: all of its conditions, or any of them. */
export const caseHolds = (c: ExpiryCase, answers: Record<string, unknown>, now: Date) =>
  c.match === "any" ? c.conditions.some((x) => holds(x, answers, now)) : c.conditions.every((x) => holds(x, answers, now));

const pos = (v: unknown, max: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(max, Math.round(Number(v))) : undefined);

const fieldIdOf = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : null);

/** Conditions stored in earlier shapes ("type" + op, or op + "not") as today's operators; null = no equivalent. */
function legacyCondition(o: Record<string, unknown>): Record<string, unknown> | null {
  const first: Record<string, string> = { "day:lte": "dayLte", "day:gt": "dayGt", "today:past": "beforeToday", "today:within": "nextDays", "today:beyond": "afterDays" };
  const op = typeof o.type === "string" ? first[`${o.type}:${String(o.op)}`] : String(o.op);
  const n = o.n ?? o.day ?? o.days;
  const not = o.not === true;
  const flip: Record<string, [string, string | null]> = {
    beforeToday: ["beforeToday", "todayOrAfter"], afterToday: ["afterToday", "todayOrBefore"], today: ["today", "notToday"],
    on: ["is", "isNot"], before: ["before", "onOrAfter"], after: ["after", "onOrBefore"],
    dayLte: ["dayLte", "dayGt"], dayGt: ["dayGt", "dayLte"], blank: ["blank", "notBlank"],
    nextDays: ["duringNext", null], lastDays: ["duringPrevious", null], afterDays: ["afterNext", null],
  };
  const mapped = op && flip[op] ? flip[op]![not ? 1 : 0] : op && not ? `not${op[0]!.toUpperCase()}${op.slice(1)}` : op;
  if (!mapped) return null;
  return { fieldId: o.fieldId, op: mapped, n, unit: "days", date: o.date };
}

function normalizeCondition(raw: unknown): ExpiryCondition | null {
  if (!raw || typeof raw !== "object") return null;
  let o = raw as Record<string, unknown>;
  if (typeof o.type === "string" || "not" in o || ["nextDays", "lastDays", "afterDays", "on"].includes(String(o.op))) {
    const converted = legacyCondition(o);
    if (!converted) return null;
    o = converted;
  }
  const fieldId = fieldIdOf(o.fieldId);
  if (!fieldId || !(COND_OPS as readonly string[]).includes(String(o.op))) return null;
  const op = o.op as CondOp;
  const needs = condNeeds(op);
  // The current date is checked only by its day of the month: anything else compares today with itself.
  if (fieldId === TODAY_FIELD && needs !== "day") return null;
  const out: ExpiryCondition = { fieldId, op };
  if (needs === "day") {
    const day = pos(o.n, 31);
    if (!day) return null;
    out.n = day;
  } else if (needs === "span") {
    out.n = Math.min(3650, Math.max(0, Math.round(Number(o.n) || 0)));
    out.unit = (COND_UNITS as readonly string[]).includes(String(o.unit)) ? (o.unit as CondUnit) : "days";
  } else if (needs === "period") {
    out.period = (COND_PERIODS as readonly string[]).includes(String(o.period)) ? (o.period as CondPeriod) : "month";
  } else if (needs === "date") {
    const other = fieldIdOf(o.otherFieldId);
    if (other && other !== TODAY_FIELD) out.otherFieldId = other;
    else if (typeof o.date === "string" && parseDate(o.date)) out.date = o.date.slice(0, 10);
    else return null;
  }
  return out;
}

/** Stored JSON (possibly junk, possibly an older rule) to a rule, or null for the default. */
export function normalizeExpiryRule(raw: unknown): ExpiryRule | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "when") {
    const condition = normalizeCondition(o.condition);
    return condition ? { kind: "when", condition } : null;
  }
  if (o.kind === "cases") {
    const otherwise = normalizeOutcome(o.otherwise);
    if (!otherwise || !Array.isArray(o.cases)) return null;
    const cases: ExpiryCase[] = [];
    for (const c of o.cases.slice(0, 10)) {
      const g = (c ?? {}) as { conditions?: unknown; when?: unknown; and?: unknown; match?: unknown; then?: unknown };
      // Earlier shape: one condition ("when") and more that must hold too ("and").
      const list = Array.isArray(g.conditions) ? g.conditions : [g.when, ...(Array.isArray(g.and) ? g.and : [])];
      const conditions = list.slice(0, 20).map(normalizeCondition);
      const then = normalizeOutcome(g.then);
      if (!conditions.length || conditions.some((x) => !x) || !then) return null; // an incomplete condition is not saved silently without it
      cases.push({ ...(g.match === "any" ? { match: "any" as const } : {}), conditions: conditions as ExpiryCondition[], then });
    }
    return cases.length ? { kind: "cases", cases, otherwise } : otherwise;
  }
  return normalizeOutcome(raw);
}

function normalizeOutcome(raw: unknown): ExpiryOutcome | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "none") return { kind: "none" };
  // Older rules, as the general rule.
  if (o.kind === "days") return pos(o.days, 3650) ? { kind: "calc", base: { from: "sent" }, addDays: pos(o.days, 3650) } : null;
  if ((o.kind === "dayOfNextMonth" || o.kind === "dayOfMonth") && pos(o.day, 31) && typeof o.dateFieldId === "string" && o.dateFieldId) {
    return { kind: "calc", base: { from: "field", fieldId: o.dateFieldId }, snap: { day: pos(o.day, 31)!, mode: o.kind === "dayOfNextMonth" ? "next" : "sameOrNext" }, ...(pos(o.fallbackDays, 3650) ? { fallbackDays: pos(o.fallbackDays, 3650) } : {}) };
  }
  if (o.kind !== "calc" || !o.base || typeof o.base !== "object") return null;
  const b = o.base as Record<string, unknown>;
  const base: ExpiryBase | null = b.from === "sent" ? { from: "sent" } : b.from === "stepStart" ? { from: "stepStart" } : b.from === "field" && typeof b.fieldId === "string" && b.fieldId ? { from: "field", fieldId: b.fieldId.slice(0, 80) } : null;
  if (!base) return null;
  const sn = o.snap && typeof o.snap === "object" ? (o.snap as Record<string, unknown>) : null;
  const snap: ExpirySnap | undefined = sn && pos(sn.day, 31) && (sn.mode === "next" || sn.mode === "sameOrNext" || sn.mode === "same") ? { day: pos(sn.day, 31)!, mode: sn.mode } : undefined;
  const addDays = pos(o.addDays, 3650);
  const addMonths = pos(o.addMonths, 120);
  // From a moment with nothing added or rounded would expire at once: not a rule.
  if (base.from !== "field" && !addDays && !addMonths && !snap) return null;
  return { kind: "calc", base, ...(addDays ? { addDays } : {}), ...(addMonths ? { addMonths } : {}), ...(snap ? { snap } : {}), ...(pos(o.fallbackDays, 3650) ? { fallbackDays: pos(o.fallbackDays, 3650) } : {}) };
}

/**
 * A step's stored rule. Step rules saved before the general rule counted "N days" from the step's start (not from
 * the sending), so an old `days` rule on a step reads as "N days from the step's start".
 */
export function normalizeStepExpiryRule(raw: unknown): ExpiryRule | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (o?.kind === "days") return pos(o.days, 3650) ? { kind: "calc", base: { from: "stepStart" }, addDays: pos(o.days, 3650) } : null;
  return normalizeExpiryRule(raw);
}

/** Hebrew, as a sentence: "ה-7 בחודש שאחרי „תאריך תחילה"", "30 ימים מהשליחה"… */
export function describeExpiryRule(raw: ExpiryRule | LegacyRule | null | undefined, fieldLabel?: (id: string) => string): string {
  if (!raw) return `${DEFAULT_EXPIRY_DAYS} ימים מהשליחה`;
  const rule = normalizeExpiryRule(raw);
  if (!rule) return `${DEFAULT_EXPIRY_DAYS} ימים מהשליחה`;
  if (rule.kind === "when") return `פג כאשר ${describeCondition(rule.condition, fieldLabel)}`;
  if (rule.kind === "cases") {
    const cond = (c: ExpiryCondition) => describeCondition(c, fieldLabel);
    return [...rule.cases.map((c) => `אם ${c.conditions.map(cond).join(c.match === "any" ? " או " : " וגם ")}: ${describeExpiryRule(c.then, fieldLabel)}`), `אחרת: ${describeExpiryRule(rule.otherwise, fieldLabel)}`].join("; ");
  }
  if (rule.kind === "none") return "ללא תוקף";
  const from = rule.base.from === "sent" ? "השליחה" : rule.base.from === "stepStart" ? "תחילת השלב" : `"${fieldLabel?.(rule.base.fieldId) ?? rule.base.fieldId}"`;
  const parts = [rule.addMonths ? (rule.addMonths === 1 ? "חודש" : `${rule.addMonths} חודשים`) : "", rule.addDays ? (rule.addDays === 1 ? "יום" : `${rule.addDays} ימים`) : ""].filter(Boolean);
  const plus = parts.join(" ו-");
  if (!rule.snap) return `${plus} ${rule.base.from === "field" ? "אחרי" : "מ"}${from}`.trim();
  const after = plus ? ` ${plus} אחרי ${from}` : ` ${from}`;
  if (rule.snap.mode === "next") return `ה-${rule.snap.day} בחודש שאחרי${after}`;
  if (rule.snap.mode === "same") return `ה-${rule.snap.day} באותו חודש של${after}`;
  return `ה-${rule.snap.day} בחודש לפי${after} (אותו חודש אם לא עבר, אחרת הבא)`;
}

/** A step's link rule: its organization's exception, else its own; null = the step follows the request's expiry. */
export function stepExpiryRule(step: { expiry?: unknown; expiryByOrg?: Record<string, unknown> }, organizationId: string | null | undefined): ExpiryRule | null {
  return normalizeStepExpiryRule((organizationId ? step.expiryByOrg?.[organizationId] : undefined) ?? step.expiry);
}

/** A step's link never ends sooner than this after the step starts (a past start date would otherwise kill it at once). */
export const MIN_STEP_LINK_DAYS = 3;

/** The deadline of a step's link from its own rule, counted from when the step starts; null = never. */
export function stepLinkDeadline(rule: ExpiryRule, answers: Record<string, unknown>, startedAt: Date, sentAt: Date = startedAt, today: Date = startedAt): Date | null {
  const at = expiryFor(rule, answers, { sent: sentAt, start: startedAt, today });
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
    const rule = normalizeStepExpiryRule(r);
    if (rule && /^[0-9a-f-]{36}$/i.test(org)) out[org] = rule;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The form fields a rule reads (the date it counts from, and those its conditions look at). */
export function expiryRuleFields(raw: unknown): string[] {
  const rule = normalizeExpiryRule(raw);
  if (!rule || rule.kind === "none") return [];
  const of = (r: ExpiryOutcome) => (r.kind === "calc" && r.base.from === "field" ? [r.base.fieldId] : []);
  if (rule.kind === "calc") return of(rule);
  if (rule.kind === "when") return [rule.condition.fieldId, ...(rule.condition.otherFieldId ? [rule.condition.otherFieldId] : [])].filter((f) => f !== TODAY_FIELD);
  return [...new Set([...rule.cases.flatMap((c) => [...c.conditions.flatMap((x) => [x.fieldId, ...(x.otherFieldId ? [x.otherFieldId] : [])]), ...of(c.then)]), ...of(rule.otherwise)])].filter((f) => f !== TODAY_FIELD);
}

/**
 * Whether a rule's deadline has to be worked out again as the days pass: any rule with cases – its conditions
 * compare with today, or read a date a later step may still fill.
 */
export function comparesToday(raw: unknown): boolean {
  const kind = normalizeExpiryRule(raw)?.kind;
  return kind === "cases" || kind === "when";
}

/** Each operator in words; `{v}` stands for its value. */
export const COND_TEXT: Record<CondOp, string> = {
  today: "הוא היום", notToday: "אינו היום", beforeToday: "לפני היום", afterToday: "אחרי היום", todayOrBefore: "היום או לפני", todayOrAfter: "היום או אחרי",
  thisWeek: "בשבוע הנוכחי", notThisWeek: "לא בשבוע הנוכחי", thisMonth: "בחודש הנוכחי", notThisMonth: "לא בחודש הנוכחי",
  thisQuarter: "ברבעון הנוכחי", notThisQuarter: "לא ברבעון הנוכחי", thisYear: "בשנה הנוכחית", notThisYear: "לא בשנה הנוכחית",
  lastWeek: "בשבוע שעבר", notLastWeek: "לא בשבוע שעבר", lastMonth: "בחודש שעבר", notLastMonth: "לא בחודש שעבר",
  lastQuarter: "ברבעון שעבר", notLastQuarter: "לא ברבעון שעבר", lastYear: "בשנה שעברה", notLastYear: "לא בשנה שעברה",
  nextWeek: "בשבוע הבא", notNextWeek: "לא בשבוע הבא", nextMonth: "בחודש הבא", notNextMonth: "לא בחודש הבא",
  nextQuarter: "ברבעון הבא", notNextQuarter: "לא ברבעון הבא", nextYear: "בשנה הבאה", notNextYear: "לא בשנה הבאה",
  duringCurrent: "במהלך {v}", duringPrevious: "במהלך {v} האחרונים", duringNext: "במהלך {v} הבאים", beforePrevious: "לפני יותר מ-{v}", afterNext: "בעוד יותר מ-{v}",
  is: "שווה ל-{v}", isNot: "שונה מ-{v}", before: "לפני {v}", after: "אחרי {v}", onOrBefore: "עד {v} (כולל)", onOrAfter: "מ-{v} והלאה",
  blank: "ריק", notBlank: "לא ריק",
  dayLte: "עד ה-{v} בחודש", dayGt: "אחרי ה-{v} בחודש",
};
export const UNIT_TEXT: Record<CondUnit, string> = { days: "ימים", weeks: "שבועות", months: "חודשים", years: "שנים" };
export const PERIOD_TEXT: Record<CondPeriod, string> = { week: "השבוע הנוכחי", month: "החודש הנוכחי", quarter: "הרבעון הנוכחי", year: "השנה הנוכחית" };

/** A condition in words: '"תאריך תחילה" בחודש הבא'. */
export function describeCondition(c: ExpiryCondition, fieldLabel?: (id: string) => string): string {
  const name = (id: string) => (id === TODAY_FIELD ? "התאריך הנוכחי" : `"${fieldLabel?.(id) ?? id}"`);
  const needs = condNeeds(c.op);
  const date = parseDate(c.date);
  const v = needs === "day" ? String(c.n ?? 0)
    : needs === "span" ? `${c.n ?? 0} ${UNIT_TEXT[c.unit ?? "days"]}`
      : needs === "period" ? PERIOD_TEXT[c.period ?? "month"]
        : needs === "date" ? (c.otherFieldId ? name(c.otherFieldId) : date ? `${date.d}.${date.m}.${date.y}` : "") : "";
  return `${name(c.fieldId)} ${COND_TEXT[c.op].replace("{v}", v)}`;
}

/**
 * A rule of the "כללי תוקף" table: for one step (by its role) and/or one organization – never for both "all" (that is
 * the form's own rule, `packages.expiry_rule`). The most specific applies: step + organization, then the step, then the
 * organization, then the form's rule.
 */
export type ExpiryRuleRow = { id: string; stepRole?: string; orgId?: string; rule: ExpiryRule };

/** Stored rows (possibly junk) to rows: each needs a scope and a valid rule; one row per scope. */
export function normalizeExpiryRows(raw: unknown): ExpiryRuleRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ExpiryRuleRow[] = [];
  for (const r of raw.slice(0, 200)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const stepRole = typeof o.stepRole === "string" && o.stepRole ? o.stepRole.slice(0, 80) : undefined;
    const orgId = typeof o.orgId === "string" && o.orgId ? o.orgId.slice(0, 80) : undefined;
    const rule = normalizeExpiryRule(o.rule);
    if ((!stepRole && !orgId) || !rule) continue;
    if (out.some((x) => x.stepRole === stepRole && x.orgId === orgId)) continue;
    out.push({ id: typeof o.id === "string" && o.id ? o.id.slice(0, 80) : `${stepRole ?? "*"}:${orgId ?? "*"}`, ...(stepRole ? { stepRole } : {}), ...(orgId ? { orgId } : {}), rule });
  }
  return out;
}

/** The rule of the request for an organization: its row ("every step, this organization"), else the form's. */
export function requestExpiryRule(formRule: unknown, rows: unknown, orgId: string | null): ExpiryRule | null {
  const row = orgId ? normalizeExpiryRows(rows).find((r) => !r.stepRole && r.orgId === orgId) : undefined;
  return row ? row.rule : normalizeExpiryRule(formRule);
}

/**
 * A step's own rule from the table: for this step and organization (or project – a route of a project of its own
 * came into the table under the project's id), else for this step; null = none.
 */
export function stepRowRule(rows: unknown, stepRole: string, orgId: string | null, projectId: string | null = null): ExpiryRule | null {
  const list = normalizeExpiryRows(rows);
  const of = (id: string | null) => (id ? list.find((r) => r.stepRole === stepRole && r.orgId === id)?.rule : undefined);
  return of(projectId) ?? of(orgId) ?? list.find((r) => r.stepRole === stepRole && !r.orgId)?.rule ?? null;
}

type LegacyStep = { role: string; expiry?: unknown; expiryByOrg?: Record<string, unknown> };

/**
 * Rules older forms kept on their steps ("expiry" / "expiryByOrg", and the steps of an organization's own route), as
 * rows of the table. `rows` (saved in the table) win over them for the same scope.
 */
export function withLegacyExpiryRows(rows: unknown, workflow: { steps: LegacyStep[] } | null | undefined, orgWorkflows: Record<string, { steps: LegacyStep[] }> | null | undefined, roleAt?: (index: number) => string | undefined): ExpiryRuleRow[] {
  const legacy: unknown[] = [];
  for (const [i, step] of (workflow?.steps ?? []).entries()) {
    // `roleAt`: the role the step gets as it is saved now (older forms had steps sharing a role).
    const s = { ...step, role: roleAt?.(i) ?? step.role };
    if (s.role === "requester") continue;
    const own = normalizeStepExpiryRule(s.expiry);
    if (own) legacy.push({ id: `${s.role}:*`, stepRole: s.role, rule: own });
    for (const [orgId, r] of Object.entries(s.expiryByOrg ?? {})) {
      const rule = normalizeStepExpiryRule(r);
      if (rule) legacy.push({ id: `${s.role}:${orgId}`, stepRole: s.role, orgId, rule });
    }
  }
  for (const [orgId, w] of Object.entries(orgWorkflows ?? {})) {
    for (const s of w.steps ?? []) {
      const rule = s.role === "requester" ? null : normalizeStepExpiryRule(s.expiry);
      if (rule) legacy.push({ id: `${s.role}:${orgId}`, stepRole: s.role, orgId, rule });
    }
  }
  return normalizeExpiryRows([...normalizeExpiryRows(rows), ...legacy]);
}

/** The steps without the rules they kept themselves (they live in the table now). */
export function withoutStepExpiry<W extends { steps: LegacyStep[] }>(w: W): W {
  return { ...w, steps: w.steps.map((s) => { const c = { ...s }; delete c.expiry; delete c.expiryByOrg; return c; }) };
}

/** Whether any step still keeps a rule of its own (older forms). */
export function hasStepExpiry(workflow: { steps: LegacyStep[] } | null | undefined, orgWorkflows: Record<string, { steps: LegacyStep[] }> | null | undefined): boolean {
  const kept = (w?: { steps: LegacyStep[] } | null) => (w?.steps ?? []).some((s) => s.expiry !== undefined || s.expiryByOrg !== undefined);
  return kept(workflow) || Object.values(orgWorkflows ?? {}).some(kept);
}
