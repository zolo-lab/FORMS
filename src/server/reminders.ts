/** Cron job: nudge the people whose step has been waiting (policy per organization). */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { createToken } from "@/lib/auth/tokens";
import { renderDefault } from "@/lib/notifications/templates";
import { reminderDue } from "@/lib/workflow/reminders";
import { DEFAULT_REMINDER_POLICY } from "@/lib/workflow/types";
import { deliveryTargets } from "@/lib/notifications/channels";
import { enqueue } from "./notifications";
import { appUrl } from "./requests-store";

const { signingSteps, requests, organizations, notifications, stepTokens } = schema;

/** Queues a reminder for every open step whose turn has come. Returns how many were queued. */
export async function runReminders(now = new Date(), opts: { organizationId?: string } = {}): Promise<number> {
  const open = await db
    .select({ step: signingSteps, request: requests, org: organizations })
    .from(signingSteps)
    .innerJoin(requests, eq(requests.id, signingSteps.requestId))
    .innerJoin(organizations, eq(organizations.id, requests.organizationId))
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
  for (const { step, request, org } of open) {
    if (step.role === "requester" || !step.activatedAt) continue;
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
