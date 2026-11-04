/**
 * The DB side of the personal notification settings. One row per user; the rules live in
 * `src/lib/notifications/user-prefs.ts`.
 *
 * Messages are matched to a person by the address they are sent to (e-mail or mobile), because most sends only
 * know the contact details of the step's assignee, not a user id. Someone who is not a user of the system has no
 * row and nothing changes for them.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeIsraeliPhone } from "@/lib/whatsapp";
import { EMPTY_PREFS, normalizePrefs, wantsMessage, type Channel, type UserNotificationPrefs } from "@/lib/notifications/user-prefs";

const { userNotificationPrefs, users } = schema;

/** Postgres 42P01 / 42703 before the migration reached this database: behave as if nobody set anything. */
function isMissingSchema(e: unknown): boolean {
  for (let cur = e as { code?: string; message?: string; cause?: unknown } | undefined, i = 0; cur && i < 4; cur = cur.cause as typeof cur, i++) {
    if (cur.code === "42P01" || cur.code === "42703" || /does not exist/.test(String(cur.message ?? ""))) return true;
  }
  return false;
}

export async function getPrefs(userId: string): Promise<UserNotificationPrefs> {
  try {
    const [row] = await db.select().from(userNotificationPrefs).where(eq(userNotificationPrefs.userId, userId));
    return row ? normalizePrefs({ groups: row.groups, reminderTiming: row.reminderTiming }) : EMPTY_PREFS;
  } catch (e) {
    if (isMissingSchema(e)) return EMPTY_PREFS;
    throw e;
  }
}

export async function savePrefs(userId: string, raw: unknown): Promise<UserNotificationPrefs> {
  const prefs = normalizePrefs(raw);
  const [existing] = await db.select({ id: userNotificationPrefs.id }).from(userNotificationPrefs).where(eq(userNotificationPrefs.userId, userId));
  const set = { groups: prefs.groups, reminderTiming: prefs.reminderTiming, updatedAt: new Date() };
  if (existing) await db.update(userNotificationPrefs).set(set).where(eq(userNotificationPrefs.id, existing.id));
  else await db.insert(userNotificationPrefs).values({ userId, ...set });
  return prefs;
}

/** The key a message's destination is looked up by: a lower-cased e-mail or an Israeli mobile in 972… form. */
export function contactKey(to: string): string {
  const s = to.trim();
  if (s.includes("@")) return s.toLowerCase();
  return normalizeIsraeliPhone(s) ?? s;
}

export type PrefsByContact = Map<string, UserNotificationPrefs>;

/** Loads the settings of everyone reachable at one of these addresses, indexed by address. */
export async function prefsByContact(contacts: (string | null | undefined)[]): Promise<PrefsByContact> {
  const keys = [...new Set(contacts.filter((c): c is string => !!c?.trim()).map(contactKey))];
  const out: PrefsByContact = new Map();
  if (!keys.length) return out;
  try {
    const rows = await db
      .select({ email: users.email, groups: userNotificationPrefs.groups, reminderTiming: userNotificationPrefs.reminderTiming })
      .from(userNotificationPrefs)
      .innerJoin(users, eq(users.id, userNotificationPrefs.userId));
    for (const r of rows) {
      const prefs = normalizePrefs({ groups: r.groups, reminderTiming: r.reminderTiming });
      const key = contactKey(r.email);
      if (keys.includes(key)) out.set(key, prefs);
    }
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
  }
  return out;
}

export interface Addressed {
  to: string;
  channel: Channel;
  templateKey: string;
}

/**
 * Drops the rows whose recipient asked not to get that kind of message on that channel. Everything about people
 * who are not users of the system, and every sign-in code, passes through untouched.
 */
export async function keepWanted<T extends Addressed>(rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const index = await prefsByContact(rows.map((r) => r.to));
  if (!index.size) return rows;
  return rows.filter((r) => wantsMessage(index.get(contactKey(r.to)), r.templateKey, r.channel));
}
