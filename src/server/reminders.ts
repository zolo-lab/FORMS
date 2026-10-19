/** Cron job: nudge the people whose step has been waiting (policy per organization). */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { createToken } from "@/lib/auth/tokens";
import { renderDefault } from "@/lib/notifications/templates";
import { canSendReminderNow, reminderDue } from "@/lib/workflow/reminders";
import { DEFAULT_REMINDER_POLICY } from "@/lib/workflow/types";
import { deliveryTargets } from "@/lib/notifications/channels";
import { enqueue } from "./notifications";
import { appUrl } from "./requests-store";

const { signingSteps, requests, organizations, notifications, stepTokens, packageTemplates } = schema;

/** Queues a reminder for every open step whose turn has come. Returns how many were queued. */
export async function runReminders(now = new Date(), opts: { organizationId?: string } = {}): Promise<number> {
  const open = await db
    .select({ step: signingSteps, request: requests, org: organizations, remindersEnabled: packageTemplates.remindersEnabled })
    .from(signingSteps)
    .innerJoin(requests, eq(requests.id, signingSteps.requestId))
    .innerJoin(organizations, eq(organizations.id, requests.organizationId))
    .innerJoin(packageTemplates, eq(packageTemplates.id, requests.packageTemplateId))
    .where(and(inArray(signingSteps.status, ["active", "in_progress"]), inArray(requests.status, ["in_progress", "returned"]), opts.organizationId ? eq(requests.organizationId, opts.organizationId) : undefined));

  // One query for every earlier reminder, instead of one per step.
  const sentByStep = new Map<string, Date[]>();
  if (open.length) {
    const past = await db
      .select({ stepId: notifications.stepId, createdAt: notifications.createdAt })
      .from(notifications)
      .where(and(eq(notifications.templateKey, "reminder"), inArray(notifications.stepId, open.map((o) => o.step.id))))
      .orderBy(desc(notifications.createdAt));
    for (const n of past) if (n.stepId) sentByStep.set(n.stepId, [...(sentByStep.get(n.stepId) ?? []), n.createdAt]);
  }

  let queued = 0;
  for (const { step, request, org, remindersEnabled } of open) {
    if (!remindersEnabled || step.role === "requester" || !step.activatedAt) continue;
    const targets = deliveryTargets({ email: step.assigneeEmail, phone: step.assigneePhone });
    if (!targets.length) continue;
    const policy = org.reminderPolicy ?? DEFAULT_REMINDER_POLICY;

    const past = sentByStep.get(step.id) ?? [];
    if (!reminderDue({ activatedAt: step.activatedAt, sent: past.length, lastSentAt: past[0] ?? null }, policy, now)) continue;

    // A second valid link, so a reminder never kills a tab the person already has open.
    const { token, hash } = createToken();
    await db.insert(stepTokens).values({ stepId: step.id, tokenHash: hash, expiresAt: request.expiresAt });
    const msg = renderDefault("reminder", {
      name: step.role === "employee" ? request.subjectName : (step.assigneeName ?? request.subjectName),
      org: org.name,
      link: `${appUrl()}/s/${token}`,
      dueDate: request.expiresAt ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem" }).format(request.expiresAt) : "",
    });
    for (const t of targets) {
      await enqueue({
        organizationId: org.id,
        requestId: request.id,
        stepId: step.id,
        channel: t.channel,
        to: t.to,
        templateKey: "reminder",
        subject: t.channel === "email" ? msg.subject : "",
        body: msg.body,
      });
    }
    queued++;
  }
  return queued;
}

export const REMIND_NOW_GAP_MS = 4 * 3_600_000;

/**
 * "שלח תזכורת עכשיו" from the tracking screen or the request page: one reminder to whoever the open step waits for,
 * at most once every 4 hours per step, respecting quiet hours. The link goes to the person only – it is never returned.
 */
export async function remindNow(requestId: string, actor: { id?: string }, now = new Date()): Promise<{ ok: boolean; message: string }> {
  const rows = await db
    .select({ step: signingSteps, request: requests, org: organizations })
    .from(signingSteps)
    .innerJoin(requests, eq(requests.id, signingSteps.requestId))
    .innerJoin(organizations, eq(organizations.id, requests.organizationId))
    .where(and(eq(signingSteps.requestId, requestId), inArray(signingSteps.status, ["active", "in_progress"]), inArray(requests.status, ["in_progress", "returned"])));
  const open = rows.filter((r) => r.step.role !== "requester");
  if (!open.length) return { ok: false, message: "אין שלב פתוח שממתין לתזכורת" };
  const policy = open[0]!.org.reminderPolicy ?? DEFAULT_REMINDER_POLICY;
  if (!canSendReminderNow(now, policy)) return { ok: false, message: "עכשיו שעות שקט או שבת – התזכורת לא נשלחה" };
  const last = await db
    .select({ at: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.requestId, requestId), eq(notifications.templateKey, "reminder")))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  if (last[0] && now.getTime() - last[0].at.getTime() < REMIND_NOW_GAP_MS) return { ok: false, message: "כבר נשלחה תזכורת בארבע השעות האחרונות" };
  let sent = 0;
  for (const { step, request, org } of open) {
    const targets = deliveryTargets({ email: step.assigneeEmail, phone: step.assigneePhone });
    if (!targets.length) continue;
    const { token, hash } = createToken();
    await db.insert(stepTokens).values({ stepId: step.id, tokenHash: hash, expiresAt: request.expiresAt });
    const msg = renderDefault("reminder", {
      name: step.role === "employee" ? request.subjectName : (step.assigneeName ?? request.subjectName),
      org: org.name,
      link: `${appUrl()}/s/${token}`,
      dueDate: request.expiresAt ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem" }).format(request.expiresAt) : "",
    });
    for (const t of targets) {
      await enqueue({ organizationId: org.id, requestId, stepId: step.id, channel: t.channel, to: t.to, templateKey: "reminder", subject: t.channel === "email" ? msg.subject : "", body: msg.body });
    }
    sent++;
  }
  if (!sent) return { ok: false, message: "אין לממתין מייל או נייד לשליחה" };
  await db.insert(schema.events).values({ requestId, actorType: "user", actorId: actor.id, type: "reminder_sent_manually", payload: { steps: sent } });
  return { ok: true, message: "התזכורת נשלחה" };
}
