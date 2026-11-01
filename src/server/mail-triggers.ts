/**
 * The DB side of the e-mail triggers: what is switched on, to whom and with which text, for one organization.
 * Every place that queues a message asks here first (see src/lib/notifications/triggers.ts for the rules).
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { effectiveTemplate, effectiveTrigger, renderMessage, type EffectiveTrigger, type TemplateRow, type TriggerSetting } from "@/lib/notifications/triggers";
import type { MessageTemplate } from "@/lib/notifications/templates";

const { mailTriggers, messageTemplates, organizations } = schema;

/** Postgres 42P01 (table missing) / 42703 (column missing) before the migration reached this database. */
function isMissingSchema(e: unknown): boolean {
  for (let cur = e as { code?: string; message?: string; cause?: unknown } | undefined, i = 0; cur && i < 4; cur = cur.cause as typeof cur, i++) {
    if (cur.code === "42P01" || cur.code === "42703" || /does not exist/.test(String(cur.message ?? ""))) return true;
  }
  return false;
}

export interface Triggers {
  trigger(key: string): EffectiveTrigger;
  template(key: string): MessageTemplate;
  render(key: string, vars: Record<string, string | undefined>): MessageTemplate;
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
      settings: settings.map((s) => ({ organizationId: s.organizationId, key: s.key, enabled: s.enabled, recipients: s.recipients, fixedRecipients: s.fixedRecipients })),
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
