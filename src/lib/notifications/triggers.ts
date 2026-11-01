/**
 * E-mail triggers: every message the system sends goes through one trigger with a fixed key. A trigger can be switched
 * off, its recipients chosen and its text edited, at two levels: all organizations (organizationId = null) and one
 * organization (wins). Without a stored setting, the defaults below apply (what the system did before the panel).
 * Pure, unit tested; the DB side is `src/server/mail-triggers.ts`.
 */
import { DEFAULT_TEMPLATES, renderTemplate, type MessageTemplate } from "./templates";

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

export type TriggerKey = "step_invite" | "returned" | "reminder" | "step_done" | "completed" | "declined" | "completion_docs" | "weekly_digest" | "otp";

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
}

const PERSON_VARS = ["name", "org", "form", "subject"];

export const TRIGGERS: TriggerDef[] = [
  { key: "step_invite", label: "הזמנה למילוי וחתימה", when: "כשמגיע תורו של מישהו למלא או לחתום", defaults: ["signer"], allowed: ["signer"], vars: [...PERSON_VARS, "link", "dueDate"] },
  { key: "reminder", label: "תזכורת", when: "לפי מדיניות התזכורות, למי שעוד לא מילא", defaults: ["signer"], allowed: ["signer"], vars: [...PERSON_VARS, "link", "dueDate"] },
  { key: "returned", label: "הוחזר לתיקון", when: "כשמישהו דוחה ומחזיר את הבקשה לשלב קודם", defaults: ["signer"], allowed: ["signer"], vars: [...PERSON_VARS, "link", "reason"] },
  { key: "step_done", label: "שלב הושלם", when: "כשמישהו סיים את השלב שלו והבקשה ממשיכה", defaults: ["creator", "trackers"], allowed: ["creator", "trackers", "secretariat", "fixed"], vars: [...PERSON_VARS, "stepName"] },
  { key: "completed", label: "התהליך הושלם", when: "כשכל השלבים הסתיימו", defaults: ["employee", "creator"], allowed: ["employee", "creator", "secretariat", "bookkeeping", "fixed"], vars: PERSON_VARS },
  { key: "declined", label: "הבקשה נדחתה", when: "כשמישהו דוחה את הבקשה סופית", defaults: ["employee", "creator"], allowed: ["employee", "creator", "secretariat", "fixed"], vars: [...PERSON_VARS, "reason"] },
  { key: "completion_docs", label: "המסמכים החתומים (PDF מצורף)", when: "בסיום התהליך, עם הקבצים החתומים", defaults: ["package"], allowed: ["package", "secretariat", "bookkeeping", "fixed"], vars: [...PERSON_VARS, "link"] },
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
}

export interface EffectiveTrigger {
  key: string;
  enabled: boolean;
  recipients: RecipientKind[];
  fixedRecipients: Person[];
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
  if (!row || def?.locked) return { key, enabled: true, recipients: defaults, fixedRecipients: [], source: "default" };
  const allowed = new Set(def?.allowed ?? defaults);
  return {
    key,
    enabled: row.enabled,
    recipients: row.recipients.filter((r) => allowed.has(r)),
    fixedRecipients: row.fixedRecipients ?? [],
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
  | { ok: true; value: { enabled: boolean; recipients: RecipientKind[]; fixedRecipients: Person[] } }
  | { ok: false; error: "unknown" | "locked" | "no_recipients" | "no_fixed" };

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
  return { ok: true, value: { enabled, recipients, fixedRecipients: fixed } };
}
