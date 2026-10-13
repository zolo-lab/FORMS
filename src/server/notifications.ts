/**
 * Outbox: rows in `notifications` are created by `enqueue` and sent by `deliverQueued` (Resend over plain fetch).
 * No real mail from non-production: without RESEND_API_KEY a queued row is only logged and stays queued.
 */
import { and, asc, eq, inArray, lt, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { MAX_ATTEMPTS, afterAttempt } from "@/lib/notifications/templates";
import { getSmsProvider } from "@/server/sms/provider";

const { notifications, organizations } = schema;

export interface EnqueueInput {
  organizationId: string;
  requestId?: string;
  stepId?: string;
  to: string;
  templateKey: string;
  subject: string;
  body: string;
  scheduledAt?: Date;
}

export async function enqueue(input: EnqueueInput & { channel?: "email" | "sms" }): Promise<string> {
  const [row] = await db
    .insert(notifications)
    .values({ ...input, channel: input.channel ?? "email" })
    .returning({ id: notifications.id });
  return row!.id;
}

interface Sender {
  name: string;
  email: string;
}

async function senderFor(organizationId: string): Promise<Sender> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  const fallback = process.env.MAIL_FROM ?? "";
  return { name: org?.senderName ?? org?.name ?? "", email: org?.senderEmail ?? fallback };
}

async function sendViaResend(apiKey: string, from: Sender, to: string, subject: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const fromHeader = from.name ? `${from.name} <${from.email}>` : from.email;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromHeader, to: [to], subject, text }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (res.ok) return { ok: true, id: json.id };
  return { ok: false, error: `${res.status} ${json.message ?? ""}`.trim() };
}

/** Sends due queued rows. Returns counts for logging / a cron endpoint. */
export async function deliverQueued(limit = 20, now = new Date()): Promise<{ sent: number; failed: number; skipped: number }> {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.status, "queued"), inArray(notifications.channel, ["email", "sms"]), lte(notifications.scheduledAt, now), lt(notifications.attempts, MAX_ATTEMPTS)))
    .orderBy(asc(notifications.scheduledAt))
    .limit(limit);

  const apiKey = process.env.RESEND_API_KEY;
  const out = { sent: 0, failed: 0, skipped: 0 };
  for (const n of rows) {
    let result: { ok: boolean; id?: string; error?: string };
    if (n.channel === "sms") {
      result = await getSmsProvider()
        .send(n.to, n.body)
        .catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    } else {
      if (!apiKey) {
        console.log(`[notifications] (no RESEND_API_KEY) would send "${n.subject ?? n.templateKey}" to ${n.to}`);
        out.skipped++;
        continue;
      }
      const from = await senderFor(n.organizationId);
      if (!from.email) result = { ok: false, error: "no sender email (set the organization sender or MAIL_FROM)" };
      else result = await sendViaResend(apiKey, from, n.to, n.subject ?? "", n.body).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    }
    const next = afterAttempt(n.attempts, result.ok);
    await db
      .update(notifications)
      .set({ status: next.status, attempts: next.attempts, providerId: result.id ?? null, error: result.ok ? null : (result.error ?? "unknown"), sentAt: result.ok ? new Date() : null })
      .where(eq(notifications.id, n.id));
    if (result.ok) out.sent++;
    else out.failed++;
  }
  return out;
}
