/** Periodic open-requests summary per organization (called from the 5-minute cron; once per scheduled hour). */
import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeGrants, normalizeRole } from "@/lib/auth/permissions";
import { isPlaceholderEmail } from "@/lib/notifications/channels";
import { DEFAULT_SUMMARY_SCHEDULE, OPEN_SUMMARY_KEY, isSummaryDue, openSummaryLines, type OpenItem } from "@/lib/notifications/open-summary";
import { addPeople } from "@/lib/notifications/triggers";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { queryRequests } from "./dashboard-store";
import { triggersFor } from "./mail-triggers";
import { enqueue } from "./notifications";
import { appUrl } from "./requests-store";

const { organizations, users, userOrganizations, notifications } = schema;

export async function runOpenSummary(now = new Date(), opts: { force?: boolean; organizationId?: string } = {}): Promise<number> {
  const orgs = await db.select().from(organizations).where(and(eq(organizations.active, true), opts.organizationId ? eq(organizations.id, opts.organizationId) : undefined));
  let sent = 0;
  for (const org of orgs) {
    const mail = await triggersFor(org.id);
    const t = mail.trigger(OPEN_SUMMARY_KEY);
    if (!t.enabled) continue;
    if (!opts.force && !isSummaryDue(t.schedule ?? DEFAULT_SUMMARY_SCHEDULE, now)) continue;
    // Once per scheduled hour: the cron runs every few minutes.
    if (!opts.force) {
      const recent = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.organizationId, org.id), eq(notifications.templateKey, OPEN_SUMMARY_KEY), gte(notifications.createdAt, new Date(now.getTime() - 2 * 3_600_000))))
        .limit(1);
      if (recent.length) continue;
    }
    const managers = t.recipients.includes("managers") ? await orgManagers(org.id) : [];
    const people = addPeople([], [
      ...(t.recipients.includes("secretariat") ? mail.secretariat : []),
      ...managers,
      ...(t.recipients.includes("fixed") ? t.fixedRecipients : []),
    ]);
    if (!people.length) continue;
    const { rows } = await queryRequests({ org: org.id, status: "in_progress", page: 1 }, now, 500, null);
    if (!rows.length) continue;
    const items = rows.map<OpenItem>((r) => ({
      subject: r.subjectName,
      packageName: r.packageName,
      waitingFor: r.waitingFor.map((w) => (w.name ? `${ROLE_LABELS[w.role as StepRole] ?? w.role} (${w.name})` : (ROLE_LABELS[w.role as StepRole] ?? w.role))).join(", ") || "—",
      days: r.daysInStep ?? 0,
      contact: r.subjectEmail ?? "",
    }));
    const msg = mail.render(OPEN_SUMMARY_KEY, { org: org.name, count: String(items.length), items: openSummaryLines(items), link: `${appUrl()}/admin/track?org=${org.id}` });
    for (const p of people) await enqueue({ organizationId: org.id, to: p.email, templateKey: OPEN_SUMMARY_KEY, subject: msg.subject, body: msg.text, html: msg.html });
    sent++;
  }
  return sent;
}

/** Admins and tracking users who may see this organization (as the weekly digest). */
async function orgManagers(organizationId: string): Promise<{ name: string; email: string }[]> {
  const all = await db.select().from(users).where(eq(users.active, true));
  const limits = await db.select().from(userOrganizations);
  return all
    .filter((u) => (normalizeRole(u.role) === "admin" || normalizeGrants(u.grants).trackOnly) && !isPlaceholderEmail(u.email))
    .filter((u) => {
      const mine = limits.filter((l) => l.userId === u.id);
      return mine.length === 0 || mine.some((l) => l.organizationId === organizationId);
    })
    .map((u) => ({ name: u.name, email: u.email }));
}
