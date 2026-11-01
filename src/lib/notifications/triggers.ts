/**
 * E-mail triggers: every message the system sends goes through one trigger with a fixed key. A trigger can be switched
 * off, its recipients chosen and its text edited, at two levels: all organizations (organizationId = null) and one
 * organization (wins). Without a stored setting, the defaults below apply (what the system did before the panel).
 * Pure, unit tested; the DB side is `src/server/mail-triggers.ts`.
 */
import { DEFAULT_TEMPLATES, renderTemplate, type MessageTemplate } from "./templates";
import { DEFAULT_SUMMARY_SCHEDULE, parseSchedule, type SummarySchedule } from "./open-summary";

export type RecipientKind = "signer" | "employee" | "creator" | "trackers" | "managers" | "secretariat" | "bookkeeping" | "package" | "fixed";

export const RECIPIENT_LABELS: Record<RecipientKind, string> = {
  signer: "מי שתורו למלא",
  employee: "העובד",
  creator: "שולח הבקשה",
  trackers: "משתמשי מעקב",
  managers: "מנהלים ומשתמשי מעקב",
  secretariat: "מזכירות העמותה",
  bookkeeping: "הנהלת חשבונות",
  package: "נמעני הטופס הקבועים",
  fixed: "כתובות קבועות",
};

export type TriggerKey = "open_summary" | "sent_to_creator" | "step_invite" | "returned" | "reminder" | "step_done" | "completed" | "declined" | "completion_docs" | "weekly_digest" | "otp";

export interface TriggerDef {
  key: TriggerKey;
  label: string;
  /** When it is sent, in one line for the panel. */
  when: string;
  defaults: RecipientKind[];
  allowed: RecipientKind[];
  /** Cannot be switched off and its text is not editable (sign-in codes). */
  locked?: boolean;
  /** Variables its text may use, in the order shown in the editor. */
  vars: string[];
  /** Runs on a schedule set in the panel (days and hour), not on an event. */
  periodic?: boolean;
}

/** What each variable means, for the text editor. */
export const VAR_LABELS: Record<string, string> = {
  name: "שם מי שמקבל",
  org: "שם העמותה",
  form: "שם הטופס",
  subject: "שם העובד בבקשה",
  link: "הקישור",
  dueDate: "תאריך אחרון",
  reason: "הסיבה",
  stepName: "שם השלב",
  creatorName: "שם שולח הבקשה",
  creatorEmail: "מייל שולח הבקשה",
  note: "הערה מהגדרות הטופס",
  count: "מספר הבקשות",
  items: "רשימת הבקשות",
};

/** Example values for the preview in the editor. */
export const SAMPLE_VARS: Record<string, string> = {
  name: "דנה כהן",
  org: "עמותת הדוגמה",
  form: "קליטת עובד",
  subject: "דנה כהן",
  link: "https://gybs-forms.vercel.app/s/…",
  dueDate: "15.11.2026",
  reason: "חסר צילום ת\"ז",
  stepName: "העובד",
  creatorName: "רות לוי",
  creatorEmail: "ruth@example.org.il",
  note: "לא ניתן להתחיל עבודה בפועל ללא חתימה על הטפסים.",
  count: "2",
  items: "• דנה כהן – קליטת עובד – ממתין לעובד – 5 ימים\n• יוסי לוי – שינוי תנאים – ממתין למאשר – 4 ימים",
};

const PERSON_VARS = ["name", "org", "form", "subject", "creatorName", "creatorEmail", "note"];

export const TRIGGERS: TriggerDef[] = [
  { key: "sent_to_creator", label: "אישור שליחה לשולח", when: "כשבקשה נשלחה לדרך, למי ששלח אותה (מה נשלח ולמי)", defaults: ["creator"], allowed: ["creator", "secretariat", "fixed"], vars: [...PERSON_VARS, "stepName", "link"] },
  { key: "step_invite", label: "הזמנה למילוי וחתימה", when: "כשמגיע תורו של מישהו למלא או לחתום", defaults: ["signer"], allowed: ["signer"], vars: [...PERSON_VARS, "link", "dueDate"] },
  { key: "reminder", label: "תזכורת", when: "לפי מדיניות התזכורות, למי שעוד לא מילא", defaults: ["signer"], allowed: ["signer"], vars: [...PERSON_VARS, "link", "dueDate"] },
  { key: "returned", label: "הוחזר לתיקון", when: "כשמישהו דוחה ומחזיר את הבקשה לשלב קודם", defaults: ["signer"], allowed: ["signer"], vars: [...PERSON_VARS, "link", "reason"] },
  { key: "step_done", label: "שלב הושלם", when: "כשמישהו סיים את השלב שלו והבקשה ממשיכה", defaults: ["creator", "trackers"], allowed: ["creator", "trackers", "secretariat", "fixed"], vars: [...PERSON_VARS, "stepName"] },
  { key: "completed", label: "התהליך הושלם", when: "כשכל השלבים הסתיימו", defaults: ["employee", "creator"], allowed: ["employee", "creator", "secretariat", "bookkeeping", "fixed"], vars: PERSON_VARS },
  { key: "declined", label: "הבקשה נדחתה", when: "כשמישהו דוחה את הבקשה סופית", defaults: ["employee", "creator"], allowed: ["employee", "creator", "secretariat", "fixed"], vars: [...PERSON_VARS, "reason"] },
  { key: "completion_docs", label: "המסמכים החתומים (PDF מצורף)", when: "בסיום התהליך, עם הקבצים החתומים", defaults: ["package"], allowed: ["package", "secretariat", "bookkeeping", "fixed"], vars: [...PERSON_VARS, "link"] },
  { key: "open_summary", label: "סיכום בקשות פתוחות למזכירות", when: "לפי התזמון: כל הבקשות של העמותה שעוד לא הסתיימו, עם למי הן ממתינות", defaults: ["secretariat"], allowed: ["secretariat", "managers", "fixed"], vars: ["org", "count", "items", "link"], periodic: true },
  { key: "weekly_digest", label: "סיכום שבועי של ממתינים", when: "ביום ראשון ב-08:00, בקשות שממתינות יותר מ-3 ימים", defaults: ["managers"], allowed: ["managers", "secretariat", "fixed"], vars: ["org", "count", "items", "link"] },
  { key: "otp", label: "קוד אימות", when: "כשמי שחותם מבקש קוד כניסה", defaults: ["signer"], allowed: ["signer"], locked: true, vars: [] },
];

export const triggerDef = (key: string): TriggerDef | undefined => TRIGGERS.find((t) => t.key === key);

export interface Person {
  name: string;
  email: string;
}

export interface TriggerSetting {
  organizationId: string | null;
  key: string;
  enabled: boolean;
  recipients: RecipientKind[];
  fixedRecipients: Person[];
  schedule?: SummarySchedule | null;
}

export interface EffectiveTrigger {
  key: string;
  enabled: boolean;
  recipients: RecipientKind[];
  fixedRecipients: Person[];
  /** Periodic triggers only: when it runs. */
  schedule: SummarySchedule | null;
  /** Where the setting came from: the code, the all-organizations row, or this organization's row. */
  source: "default" | "all" | "org";
}

/** The setting that applies to one organization: its own row, else the all-organizations row, else the defaults. */
export function effectiveTrigger(key: string, settings: TriggerSetting[], organizationId: string | null): EffectiveTrigger {
  const def = triggerDef(key);
  const own = organizationId ? settings.find((s) => s.key === key && s.organizationId === organizationId) : undefined;
  const all = settings.find((s) => s.key === key && s.organizationId === null);
  const row = own ?? all;
  const defaults = def?.defaults ?? [];
  const schedule = def?.periodic ? (row?.schedule ?? DEFAULT_SUMMARY_SCHEDULE) : null;
  if (!row || def?.locked) return { key, enabled: true, recipients: defaults, fixedRecipients: [], schedule, source: "default" };
  const allowed = new Set(def?.allowed ?? defaults);
  return {
    key,
    enabled: row.enabled,
    recipients: row.recipients.filter((r) => allowed.has(r)),
    fixedRecipients: row.fixedRecipients ?? [],
    schedule,
    source: own ? "org" : "all",
  };
}

export interface TemplateRow {
  organizationId: string | null;
  key: string;
  subject: string | null;
  body: string;
}

/** The text that applies: this organization's, else the all-organizations one, else the built-in default. */
export function effectiveTemplate(key: string, rows: TemplateRow[], organizationId: string | null): MessageTemplate & { source: "default" | "all" | "org" } {
  const own = organizationId ? rows.find((r) => r.key === key && r.organizationId === organizationId) : undefined;
  const all = rows.find((r) => r.key === key && r.organizationId === null);
  const row = triggerDef(key)?.locked ? undefined : (own ?? all);
  const def = DEFAULT_TEMPLATES[key];
  if (!row) {
    if (!def) throw new Error(`unknown message template: ${key}`);
    return { ...def, source: "default" };
  }
  return { subject: row.subject ?? def?.subject ?? "", body: row.body, source: own ? "org" : "all" };
}

export function renderMessage(t: MessageTemplate, vars: Record<string, string | undefined>): MessageTemplate {
  return { subject: renderTemplate(t.subject, vars), body: renderTemplate(t.body, vars) };
}

/** Adds people without repeating an address (case-insensitive); entries without an address are dropped. */
export function addPeople(into: Person[], people: (Person | { name?: string | null; email?: string | null } | null | undefined)[]): Person[] {
  for (const p of people) {
    const email = p?.email?.trim().toLowerCase();
    if (!email || into.some((x) => x.email === email)) continue;
    into.push({ name: p?.name?.trim() || email, email });
  }
  return into;
}

/** E-mail lists typed in a settings box: one per line or separated by commas / semicolons. */
export function parseEmailList(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const e = part.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

export type TriggerFormResult =
  | { ok: true; value: { enabled: boolean; recipients: RecipientKind[]; fixedRecipients: Person[]; schedule?: SummarySchedule | null } }
  | { ok: false; error: "unknown" | "locked" | "no_recipients" | "no_fixed" | "schedule" };

/** The panel's form for one trigger → a setting to store. Fields: enabled, recipients (repeated), fixed (text). */
export function parseTriggerForm(key: string, get: (name: string) => string | null, getAll: (name: string) => string[]): TriggerFormResult {
  const def = triggerDef(key);
  if (!def) return { ok: false, error: "unknown" };
  if (def.locked) return { ok: false, error: "locked" };
  const enabled = get("enabled") === "on";
  const recipients = def.allowed.filter((r) => getAll("recipients").includes(r));
  const fixed = recipients.includes("fixed") ? parseEmailList(get("fixed") ?? "").map((email) => ({ name: email, email })) : [];
  if (recipients.includes("fixed") && !fixed.length) return { ok: false, error: "no_fixed" };
  if (enabled && !recipients.length) return { ok: false, error: "no_recipients" };
  if (def.periodic) {
    const schedule = parseSchedule(get, getAll);
    if (!schedule) return { ok: false, error: "schedule" };
    return { ok: true, value: { enabled, recipients, fixedRecipients: fixed, schedule } };
  }
  return { ok: true, value: { enabled, recipients, fixedRecipients: fixed } };
}

export type TemplateFormResult = { ok: true; value: { subject: string; body: string } } | { ok: false; error: "unknown" | "locked" | "empty" | "too_long" };

/** The panel's text editor for one trigger → subject and body to store. */
export function parseTemplateForm(key: string, subject: string, body: string): TemplateFormResult {
  const def = triggerDef(key);
  if (!def) return { ok: false, error: "unknown" };
  if (def.locked) return { ok: false, error: "locked" };
  const s = subject.replace(/\s+/g, " ").trim();
  const b = body.replace(/\r\n/g, "\n").trim();
  if (!s || !b) return { ok: false, error: "empty" };
  if (s.length > 200 || b.length > 5000) return { ok: false, error: "too_long" };
  return { ok: true, value: { subject: s, body: b } };
}

/** Placeholders in a text that the trigger does not fill (shown as a warning; they come out empty). */
export function unknownVars(key: string, text: string): string[] {
  const allowed = new Set(triggerDef(key)?.vars ?? []);
  const out: string[] = [];
  for (const m of text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) if (!allowed.has(m[1]!) && !out.includes(m[1]!)) out.push(m[1]!);
  return out;
}
