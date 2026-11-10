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
export const COND_OPS = [
  "today", "beforeToday", "afterToday",
  "thisWeek", "nextWeek", "lastWeek", "thisMonth", "nextMonth", "lastMonth",
  "thisQuarter", "nextQuarter", "lastQuarter", "thisYear", "nextYear", "lastYear",
  "nextDays", "lastDays", "afterDays",
  "on", "before", "after",
  "dayLte", "dayGt",
  "blank",
] as const;
export type CondOp = (typeof COND_OPS)[number];
/** What an operator needs beside it: a number of days, a day of the month, or a date (yyyy-mm-dd). */
export const condNeeds = (op: CondOp): "days" | "day" | "date" | null =>
  op === "nextDays" || op === "lastDays" || op === "afterDays" ? "days" : op === "dayLte" || op === "dayGt" ? "day" : op === "on" || op === "before" || op === "after" ? "date" : null;
/** "[field] is / is not [op]"; `n`: days or the day of the month; `date`: the given date. */
export type ExpiryCondition = { fieldId: string; op: CondOp; not?: boolean; n?: number; date?: string };
/** `and`: more lines that must hold too. */
export type ExpiryCase = { when: ExpiryCondition; and?: ExpiryCondition[]; then: ExpiryOutcome };
export const caseConditions = (c: ExpiryCase): ExpiryCondition[] => [c.when, ...(c.and ?? [])];
export type ExpiryRule = ExpiryOutcome | { kind: "cases"; cases: ExpiryCase[]; otherwise: ExpiryOutcome };

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

/** Whether a condition holds on `now` – the current day. A missing date holds only for "empty". */
export function holds(c: ExpiryCondition, answers: Record<string, unknown>, now: Date): boolean {
  const t = israelDate(now);
  const date = c.fieldId === TODAY_FIELD ? t : parseDate(answers[c.fieldId]);
  if (c.op === "blank") return (date === null) !== !!c.not;
  if (!date) return false;
  const diff = dayNo(date) - dayNo(t);
  const n = c.n ?? 0;
  const given = parseDate(c.date);
  const is = ((): boolean | null => {
    switch (c.op) {
      case "today": return diff === 0;
      case "beforeToday": return diff < 0;
      case "afterToday": return diff > 0;
      case "thisWeek": return weekNo(date) === weekNo(t);
      case "nextWeek": return weekNo(date) === weekNo(t) + 1;
      case "lastWeek": return weekNo(date) === weekNo(t) - 1;
      case "thisMonth": return monthNo(date) === monthNo(t);
      case "nextMonth": return monthNo(date) === monthNo(t) + 1;
      case "lastMonth": return monthNo(date) === monthNo(t) - 1;
      case "thisQuarter": return quarterNo(date) === quarterNo(t);
      case "nextQuarter": return quarterNo(date) === quarterNo(t) + 1;
      case "lastQuarter": return quarterNo(date) === quarterNo(t) - 1;
      case "thisYear": return date.y === t.y;
      case "nextYear": return date.y === t.y + 1;
      case "lastYear": return date.y === t.y - 1;
      case "nextDays": return diff >= 0 && diff <= n;
      case "lastDays": return diff <= 0 && diff >= -n;
      case "afterDays": return diff > n;
      case "on": return given ? dayNo(date) === dayNo(given) : null;
      case "before": return given ? dayNo(date) < dayNo(given) : null;
      case "after": return given ? dayNo(date) > dayNo(given) : null;
      case "dayLte": return date.d <= n;
      case "dayGt": return date.d > n;
    }
  })();
  return is === null ? false : is !== !!c.not;
}

/** Whether every line of a case holds. */
export const caseHolds = (c: ExpiryCase, answers: Record<string, unknown>, now: Date) => caseConditions(c).every((x) => holds(x, answers, now));

const pos = (v: unknown, max: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(max, Math.round(Number(v))) : undefined);

const fieldIdOf = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : null);

function normalizeCondition(raw: unknown): ExpiryCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fieldId = fieldIdOf(o.fieldId);
  if (!fieldId) return null;
  // Conditions stored before the operators list: a day of the month, or the date against today.
  const legacy: Record<string, CondOp> = { "day:lte": "dayLte", "day:gt": "dayGt", "today:past": "beforeToday", "today:within": "nextDays", "today:beyond": "afterDays" };
  const op = (typeof o.type === "string" ? legacy[`${o.type}:${String(o.op)}`] : undefined) ?? ((COND_OPS as readonly string[]).includes(String(o.op)) ? (o.op as CondOp) : null);
  if (!op) return null;
  const needs = condNeeds(op);
  // The current date is checked only by its day of the month: anything else compares today with itself.
  if (fieldId === TODAY_FIELD && needs !== "day") return null;
  const out: ExpiryCondition = { fieldId, op, ...(o.not === true ? { not: true } : {}) };
  if (needs === "day") {
    const day = pos(o.n ?? o.day, 31);
    if (!day) return null;
    out.n = day;
  } else if (needs === "days") out.n = Math.min(3650, Math.max(0, Math.round(Number(o.n ?? o.days) || 0)));
  else if (needs === "date") {
    if (typeof o.date !== "string" || !parseDate(o.date)) return null;
    out.date = o.date.slice(0, 10);
  }
  return out;
}

/** Stored JSON (possibly junk, possibly an older rule) to a rule, or null for the default. */
export function normalizeExpiryRule(raw: unknown): ExpiryRule | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "cases") {
    const otherwise = normalizeOutcome(o.otherwise);
    if (!otherwise || !Array.isArray(o.cases)) return null;
    const cases: ExpiryCase[] = [];
    for (const c of o.cases.slice(0, 10)) {
      const when = normalizeCondition((c as { when?: unknown } | null)?.when);
      const then = normalizeOutcome((c as { then?: unknown } | null)?.then);
      const more = (c as { and?: unknown } | null)?.and;
      const and = Array.isArray(more) ? more.slice(0, 10).map(normalizeCondition) : [];
      if (!when || !then || and.some((x) => !x)) return null; // an incomplete condition is not saved silently without it
      cases.push({ when, ...(and.length ? { and: and as ExpiryCondition[] } : {}), then });
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
  if (rule.kind === "cases") {
    const cond = (c: ExpiryCondition) => describeCondition(c, fieldLabel);
    return [...rule.cases.map((c) => `אם ${caseConditions(c).map(cond).join(" וגם ")}: ${describeExpiryRule(c.then, fieldLabel)}`), `אחרת: ${describeExpiryRule(rule.otherwise, fieldLabel)}`].join("; ");
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
  return [...new Set([...rule.cases.flatMap((c) => [...caseConditions(c).map((x) => x.fieldId), ...of(c.then)]), ...of(rule.otherwise)])].filter((f) => f !== TODAY_FIELD);
}

/**
 * Whether a rule's deadline has to be worked out again as the days pass: any rule with cases – its conditions
 * compare with today, or read a date a later step may still fill.
 */
export function comparesToday(raw: unknown): boolean {
  return normalizeExpiryRule(raw)?.kind === "cases";
}

/** The words of each operator after "הוא" / "אינו"; `{n}` and `{date}` stand for its value. */
export const COND_TEXT: Record<CondOp, string> = {
  today: "היום", beforeToday: "לפני היום", afterToday: "אחרי היום",
  thisWeek: "בשבוע הנוכחי", nextWeek: "בשבוע הבא", lastWeek: "בשבוע שעבר",
  thisMonth: "בחודש הנוכחי", nextMonth: "בחודש הבא", lastMonth: "בחודש שעבר",
  thisQuarter: "ברבעון הנוכחי", nextQuarter: "ברבעון הבא", lastQuarter: "ברבעון שעבר",
  thisYear: "בשנה הנוכחית", nextYear: "בשנה הבאה", lastYear: "בשנה שעברה",
  nextDays: "בתוך {n} הימים הקרובים", lastDays: "בתוך {n} הימים האחרונים", afterDays: "בעוד יותר מ-{n} ימים",
  on: "בתאריך {date}", before: "לפני {date}", after: "אחרי {date}",
  dayLte: "עד ה-{n} בחודש", dayGt: "אחרי ה-{n} בחודש",
  blank: "ריק",
};

/** A condition in words: '"תאריך תחילה" הוא בחודש הבא'. */
export function describeCondition(c: ExpiryCondition, fieldLabel?: (id: string) => string): string {
  const name = c.fieldId === TODAY_FIELD ? "התאריך הנוכחי" : `"${fieldLabel?.(c.fieldId) ?? c.fieldId}"`;
  const date = parseDate(c.date);
  const text = COND_TEXT[c.op].replace("{n}", String(c.n ?? 0)).replace("{date}", date ? `${date.d}.${date.m}.${date.y}` : "");
  return `${name} ${c.not ? "אינו" : "הוא"} ${text}`;
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
