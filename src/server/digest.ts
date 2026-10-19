/** Weekly waiting summary per organization (called from the 5-minute cron; sends once per organization per week). */
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeGrants, normalizeRole } from "@/lib/auth/permissions";
import { isPlaceholderEmail } from "@/lib/notifications/channels";
import { DIGEST_KEY, digestItems, digestMessage, isDigestTime, type DigestItem } from "@/lib/notifications/digest";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { queryRequests } from "./dashboard-store";
import { enqueue } from "./notifications";
import { appUrl } from "./requests-store";

const { organizations, users, userOrganizations, notifications } = schema;

export async function runWeeklyDigest(now = new Date(), opts: { force?: boolean } = {}): Promise<number> {
  if (!opts.force && !isDigestTime(now)) return 0;
  const orgs = await db.select().from(organizations).where(and(eq(organizations.active, true), eq(organizations.weeklyDigest, true)));
  if (!orgs.length) return 0;
  const since = new Date(now.getTime() - 6 * 86_400_000);
  const recent = await db
    .select({ organizationId: notifications.organizationId })
    .from(notifications)
    .where(and(eq(notifications.templateKey, DIGEST_KEY), gte(notifications.createdAt, since), inArray(notifications.organizationId, orgs.map((o) => o.id))));
  const done = new Set(recent.map((r) => r.organizationId));
  const allUsers = await db.select().from(users).where(eq(users.active, true));
  const limits = await db.select().from(userOrganizations);
  let sent = 0;
  for (const org of orgs) {
    if (done.has(org.id)) continue;
    // Recipients: admins, and tracking-only users who may see this organization (no limit rows = every organization).
    const to = allUsers.filter((u) => {
      const role = normalizeRole(u.role);
      const tracker = normalizeGrants(u.grants).trackOnly;
      if (role !== "admin" && !tracker) return false;
      const mine = limits.filter((l) => l.userId === u.id);
      return mine.length === 0 || mine.some((l) => l.organizationId === org.id);
    }).filter((u) => !isPlaceholderEmail(u.email));
    if (!to.length) continue;
    const { rows } = await queryRequests({ org: org.id, status: "in_progress", page: 1 }, now, 500, null);
    const items = digestItems(
      rows.map<DigestItem>((r) => ({
        subject: r.subjectName,
        packageName: r.packageName,
        waitingFor: r.waitingFor.map((w) => ROLE_LABELS[w.role as StepRole] ?? w.role).join(", ") || "—",
        days: r.daysInStep ?? 0,
      })),
    );
    if (!items.length) continue;
    const msg = digestMessage(org.name, items, `${appUrl()}/admin/track?org=${org.id}`);
    for (const u of to) await enqueue({ organizationId: org.id, to: u.email, templateKey: DIGEST_KEY, subject: msg.subject, body: msg.body });
    sent++;
  }
  return sent;
}
