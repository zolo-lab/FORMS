/**
 * The DB side of the e-mail triggers: what is switched on, to whom and with which text, for one organization.
 * Every place that queues a message asks here first (see src/lib/notifications/triggers.ts for the rules).
 */
import { and, count, eq, gte, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { effectiveTemplate, effectiveTrigger, renderMessage, type EmailTemplate, type RenderedMessage, type EffectiveTrigger, type Person, type RecipientKind, type TemplateRow, type TriggerSetting } from "@/lib/notifications/triggers";
import type { SummarySchedule } from "@/lib/notifications/open-summary";

const { mailTriggers, messageTemplates, organizations, notifications, packageTemplates, users } = schema;

/** Postgres 42P01 (table missing) / 42703 (column missing) before the migration reached this database. */
function isMissingSchema(e: unknown): boolean {
  for (let cur = e as { code?: string; message?: string; cause?: unknown } | undefined, i = 0; cur && i < 4; cur = cur.cause as typeof cur, i++) {
    if (cur.code === "42P01" || cur.code === "42703" || /does not exist/.test(String(cur.message ?? ""))) return true;
  }
  return false;
}

export interface Triggers {
  trigger(key: string): EffectiveTrigger;
  template(key: string): EmailTemplate;
  render(key: string, vars: Record<string, string | undefined>): RenderedMessage;
  /** The organization's secretariat / bookkeeping addresses as people. */
  secretariat: { name: string; email: string }[];
  bookkeeping: { name: string; email: string }[];
}

export async function loadTriggerSettings(organizationId: string | null): Promise<{ settings: TriggerSetting[]; templates: TemplateRow[] }> {
  const scope = (col: typeof mailTriggers.organizationId | typeof messageTemplates.organizationId) => (organizationId ? or(isNull(col), eq(col, organizationId)) : isNull(col));
  try {
    const [settings, templates] = await Promise.all([
      db.select().from(mailTriggers).where(scope(mailTriggers.organizationId)),
      db.select().from(messageTemplates).where(and(eq(messageTemplates.channel, "email"), scope(messageTemplates.organizationId))),
    ]);
    return {
      settings: settings.map((s) => ({ organizationId: s.organizationId, key: s.key, enabled: s.enabled, recipients: s.recipients, fixedRecipients: s.fixedRecipients, schedule: s.schedule })),
      templates: templates.map((t) => ({ organizationId: t.organizationId, key: t.key, subject: t.subject, body: t.body })),
    };
  } catch (e) {
    if (isMissingSchema(e)) return { settings: [], templates: [] };
    throw e;
  }
}

async function orgAddresses(organizationId: string | null): Promise<{ secretariat: string[]; bookkeeping: string[] }> {
  if (!organizationId) return { secretariat: [], bookkeeping: [] };
  try {
    const [org] = await db.select({ s: organizations.secretariatEmails, b: organizations.bookkeepingEmails }).from(organizations).where(eq(organizations.id, organizationId));
    return { secretariat: org?.s ?? [], bookkeeping: org?.b ?? [] };
  } catch (e) {
    if (isMissingSchema(e)) return { secretariat: [], bookkeeping: [] };
    throw e;
  }
}

export async function triggersFor(organizationId: string | null): Promise<Triggers> {
  const [{ settings, templates }, addr] = await Promise.all([loadTriggerSettings(organizationId), orgAddresses(organizationId)]);
  const template = (key: string) => effectiveTemplate(key, templates, organizationId);
  return {
    trigger: (key) => effectiveTrigger(key, settings, organizationId),
    template,
    render: (key, vars) => renderMessage(template(key), vars),
    secretariat: addr.secretariat.map((email) => ({ name: "מזכירות", email })),
    bookkeeping: addr.bookkeeping.map((email) => ({ name: "הנהלת חשבונות", email })),
  };
}

/** Stores the setting of one trigger for all organizations (null) or one organization. */
export async function saveTriggerSetting(organizationId: string | null, key: string, value: { enabled: boolean; recipients: RecipientKind[]; fixedRecipients: Person[]; schedule?: SummarySchedule | null }, userId?: string) {
  const where = and(organizationId ? eq(mailTriggers.organizationId, organizationId) : isNull(mailTriggers.organizationId), eq(mailTriggers.key, key));
  const [existing] = await db.select({ id: mailTriggers.id }).from(mailTriggers).where(where);
  const set = { ...value, updatedBy: userId ?? null, updatedAt: new Date() };
  if (existing) await db.update(mailTriggers).set(set).where(eq(mailTriggers.id, existing.id));
  else await db.insert(mailTriggers).values({ organizationId, key, ...set });
}

/** Drops an organization's own setting, so the all-organizations one (or the default) applies again. */
export async function resetTriggerSetting(organizationId: string | null, key: string) {
  await db.delete(mailTriggers).where(and(organizationId ? eq(mailTriggers.organizationId, organizationId) : isNull(mailTriggers.organizationId), eq(mailTriggers.key, key)));
}

export async function saveOrgAddresses(organizationId: string, secretariat: string[], bookkeeping: string[]) {
  await db.update(organizations).set({ secretariatEmails: secretariat, bookkeepingEmails: bookkeeping }).where(eq(organizations.id, organizationId));
}

export async function orgAddressLists(organizationId: string): Promise<{ secretariat: string[]; bookkeeping: string[] }> {
  return orgAddresses(organizationId);
}

/** Sent / failed / waiting per trigger in the last `days` days (one organization or all). */
export async function triggerCounts(organizationId: string | null, days = 30, now = new Date()): Promise<Record<string, { sent: number; failed: number; queued: number }>> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await db
    .select({ key: notifications.templateKey, status: notifications.status, n: count() })
    .from(notifications)
    .where(and(gte(notifications.createdAt, since), organizationId ? eq(notifications.organizationId, organizationId) : undefined))
    .groupBy(notifications.templateKey, notifications.status);
  const out: Record<string, { sent: number; failed: number; queued: number }> = {};
  for (const r of rows) {
    const c = (out[r.key] ??= { sent: 0, failed: 0, queued: 0 });
    c[r.status] += Number(r.n);
  }
  return out;
}

/** Variables every request-based message can use: organization, form, the person, who sent it and the form's note. */
export async function requestVars(req: { organizationId: string; packageTemplateId: string; createdBy: string | null; subjectName: string }): Promise<Record<string, string>> {
  const [[org], [pkg], [creator]] = await Promise.all([
    db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, req.organizationId)),
    db.select({ name: packageTemplates.name, note: packageTemplates.mailNote }).from(packageTemplates).where(eq(packageTemplates.id, req.packageTemplateId)),
    req.createdBy ? db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, req.createdBy)) : Promise.resolve([]),
  ]);
  const creatorEmail = creator && !creator.email.toLowerCase().endsWith("@users.invalid") ? creator.email : "";
  return { org: org?.name ?? "", form: pkg?.name ?? "", subject: req.subjectName, creatorName: creator?.name ?? "", creatorEmail, note: pkg?.note ?? "" };
}

/** Stores the text of one trigger for all organizations (null) or one organization. */
export async function saveTemplate(organizationId: string | null, key: string, value: { subject: string; body: string }) {
  const where = and(organizationId ? eq(messageTemplates.organizationId, organizationId) : isNull(messageTemplates.organizationId), eq(messageTemplates.key, key), eq(messageTemplates.channel, "email"));
  const [existing] = await db.select({ id: messageTemplates.id }).from(messageTemplates).where(where);
  if (existing) await db.update(messageTemplates).set({ ...value, updatedAt: new Date() }).where(eq(messageTemplates.id, existing.id));
  else await db.insert(messageTemplates).values({ organizationId, key, channel: "email", ...value });
}

export async function resetTemplate(organizationId: string | null, key: string) {
  await db.delete(messageTemplates).where(and(organizationId ? eq(messageTemplates.organizationId, organizationId) : isNull(messageTemplates.organizationId), eq(messageTemplates.key, key), eq(messageTemplates.channel, "email")));
}
