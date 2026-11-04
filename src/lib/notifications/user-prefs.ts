/**
 * Personal notification settings of a signed-in user: which messages reach them, on which channel, and – for
 * reminders – after how long and how often. This is the top level of the precedence chain and beats everything
 * below it:
 *
 *   user (here)  >  form / package (`remindersEnabled`)  >  organization (`reminderPolicy`, mail triggers)  >  code
 *
 * Every field is tri-state: `undefined` means "no opinion, keep what the level below decided". Only an explicit
 * choice overrides. Pure and unit tested; the DB side is `src/server/user-notification-prefs.ts`.
 */
import { DEFAULT_REMINDER_POLICY, type ReminderPolicy } from "@/lib/workflow/types";
import type { TriggerKey } from "./triggers";

export type Channel = "email" | "sms";

/** The groups shown on the personal settings screen. Triggers are grouped so the screen stays readable. */
export type PrefGroup = "my_turn" | "reminder" | "progress" | "finished" | "summaries";

export interface GroupDef {
  key: PrefGroup;
  label: string;
  /** One line explaining when the group is sent. */
  when: string;
  /** The trigger keys this group covers. */
  triggers: TriggerKey[];
  /** False = the user may switch the whole group off. True = it always goes out (only the channel is theirs). */
  required?: boolean;
}

export const PREF_GROUPS: GroupDef[] = [
  { key: "my_turn", label: "הגיע תורי למלא או לחתום", when: "כשבקשה מגיעה אליי, וגם כשהיא הוחזרה אליי לתיקון", triggers: ["step_invite", "returned"], required: true },
  { key: "reminder", label: "תזכורות על מה שעוד לא טיפלתי", when: "כשהבקשה ממתינה לי ולא זזה – לפי הזמנים שתגדיר/י כאן", triggers: ["reminder"] },
  { key: "progress", label: "התקדמות בבקשות ששלחתי", when: "כשבקשה ששלחתי יצאה לדרך או כששלב בה הושלם", triggers: ["sent_to_creator", "step_done"] },
  { key: "finished", label: "סיום בקשה", when: "כשתהליך הסתיים או נדחה, כולל המסמכים החתומים", triggers: ["completed", "declined", "completion_docs"] },
  { key: "summaries", label: "סיכומים תקופתיים", when: "סיכום הבקשות הפתוחות והסיכום השבועי", triggers: ["open_summary", "weekly_digest"] },
];

export const CHANNEL_LABELS: Record<Channel, string> = { email: "מייל", sms: "סמס" };

const GROUP_OF: Partial<Record<TriggerKey, PrefGroup>> = Object.fromEntries(PREF_GROUPS.flatMap((g) => g.triggers.map((t) => [t, g.key] as const)));

/** The group a trigger belongs to, or null when the personal settings never touch it (sign-in codes). */
export function groupOfTrigger(key: string): PrefGroup | null {
  return GROUP_OF[key as TriggerKey] ?? null;
}

export const groupDef = (key: PrefGroup): GroupDef => PREF_GROUPS.find((g) => g.key === key)!;

/** One group's choice. Every field is optional: missing = inherit. */
export interface GroupPref {
  /** False = never send me this group. Ignored for a required group. */
  enabled?: boolean;
  /** Per channel: false = not on this channel. Missing = send on it when the address/number is known. */
  email?: boolean;
  sms?: boolean;
}

/** Only the parts of the reminder policy a person may set for themselves; the rest stays the organization's. */
export type ReminderTiming = Partial<Pick<ReminderPolicy, "firstAfterHours" | "everyHours" | "maxCount" | "quietFromHour" | "quietToHour" | "skipShabbat">>;

export interface UserNotificationPrefs {
  groups: Partial<Record<PrefGroup, GroupPref>>;
  /** Overrides the organization's reminder timing for this person only. */
  reminderTiming: ReminderTiming;
}

export const EMPTY_PREFS: UserNotificationPrefs = { groups: {}, reminderTiming: {} };

const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const hours = (v: unknown, max: number): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : undefined);

/** Accepts whatever is stored (an older shape, a hand-edited row) and returns something safe to reason about. */
export function normalizePrefs(raw: unknown): UserNotificationPrefs {
  const r = (raw ?? {}) as Partial<UserNotificationPrefs>;
  const groups: Partial<Record<PrefGroup, GroupPref>> = {};
  for (const g of PREF_GROUPS) {
    const v = (r.groups ?? {})[g.key] as GroupPref | undefined;
    if (!v || typeof v !== "object") continue;
    const pref: GroupPref = { enabled: g.required ? undefined : bool(v.enabled), email: bool(v.email), sms: bool(v.sms) };
    // A required group can never end up silent: at least one channel stays on.
    if (g.required && pref.email === false && pref.sms === false) pref.email = true;
    if (pref.enabled === undefined && pref.email === undefined && pref.sms === undefined) continue;
    groups[g.key] = pref;
  }
  const t = (r.reminderTiming ?? {}) as ReminderTiming;
  const reminderTiming: ReminderTiming = {
    firstAfterHours: hours(t.firstAfterHours, 24 * 30),
    everyHours: hours(t.everyHours, 24 * 30),
    maxCount: hours(t.maxCount, 50),
    quietFromHour: hours(t.quietFromHour, 23),
    quietToHour: hours(t.quietToHour, 23),
    skipShabbat: bool(t.skipShabbat),
  };
  // Zero hours between reminders would mean a message on every cron tick.
  if (reminderTiming.everyHours === 0) reminderTiming.everyHours = 1;
  for (const k of Object.keys(reminderTiming) as (keyof ReminderTiming)[]) if (reminderTiming[k] === undefined) delete reminderTiming[k];
  return { groups, reminderTiming };
}

/**
 * Does this person want this message on this channel?
 * `below` is what the levels under the user decided (the form's `remindersEnabled`, the organization's trigger switch).
 * A trigger outside the groups (a sign-in code) is never blocked here.
 */
export function wantsMessage(prefs: UserNotificationPrefs | undefined, triggerKey: string, channel: Channel, below = true): boolean {
  const group = groupOfTrigger(triggerKey);
  if (!group) return below;
  const pref = prefs?.groups?.[group];
  if (!pref) return below;
  const def = groupDef(group);
  // The user's own switch wins over the form and the organization – in both directions.
  const on = def.required ? true : (pref.enabled ?? below);
  if (!on) return false;
  return pref[channel] ?? true;
}

/** True when the person switched a group off (or on) themselves, so the form's setting no longer applies. */
export function hasOpinion(prefs: UserNotificationPrefs | undefined, group: PrefGroup): boolean {
  return prefs?.groups?.[group]?.enabled !== undefined;
}

/** The reminder policy for one person: the organization's, with their own numbers on top. */
export function effectiveReminderPolicy(orgPolicy: ReminderPolicy | null | undefined, prefs?: UserNotificationPrefs): ReminderPolicy {
  const base = orgPolicy ?? DEFAULT_REMINDER_POLICY;
  const t = prefs?.reminderTiming ?? {};
  return {
    firstAfterHours: t.firstAfterHours ?? base.firstAfterHours,
    everyHours: t.everyHours ?? base.everyHours,
    maxCount: t.maxCount ?? base.maxCount,
    quietFromHour: t.quietFromHour ?? base.quietFromHour,
    quietToHour: t.quietToHour ?? base.quietToHour,
    skipShabbat: t.skipShabbat ?? base.skipShabbat,
  };
}

/** Whether reminders run for this person at all: their choice, else the form's switch. */
export function remindersEnabledFor(prefs: UserNotificationPrefs | undefined, packageEnabled: boolean): boolean {
  return prefs?.groups?.reminder?.enabled ?? packageEnabled;
}
