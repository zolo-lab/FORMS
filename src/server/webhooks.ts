/** Outgoing webhooks: build the payload, sign it, deliver with retries, log failures as events. */
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { RETRY_DELAYS_MS, toWebhookEvent, type WebhookEvent } from "@/lib/webhooks/events";
import { signFileLink, webhookHeaders } from "@/lib/webhooks/sign";
import { appUrl } from "./requests-store";

const { webhooks, requests, organizations, packageDocuments, formTemplateVersions, formTemplates, events, signingSteps } = schema;

const FILE_LINK_TTL_SEC = 24 * 3600;

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("hex")}`;

export function tempFileUrl(docId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + FILE_LINK_TTL_SEC;
  const sig = signFileLink(process.env.SESSION_SECRET ?? "", docId, exp);
  return `${appUrl()}/api/webhook-files/${docId}?exp=${exp}&sig=${sig}`;
}

export interface EngineEventLike {
  type: string;
  stepId?: string;
}

async function buildPayload(requestId: string, event: WebhookEvent, stepId: string | undefined, collected: () => Promise<Record<string, unknown>>) {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!req) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, req.organizationId));
  const payload: Record<string, unknown> = {
    event,
    createdAt: new Date().toISOString(),
    request: {
      id: req.id,
      status: req.status,
      kind: req.kind,
      subject: { name: req.subjectName, idNumber: req.subjectIdNumber, email: req.subjectEmail, phone: req.subjectPhone },
      organization: { id: org?.id, name: org?.name },
      createdAt: req.createdAt.toISOString(),
      completedAt: req.completedAt?.toISOString() ?? null,
    },
  };
  if (stepId) {
    const [step] = await db.select().from(signingSteps).where(eq(signingSteps.id, stepId));
    if (step) payload.step = { id: step.id, role: step.role, status: step.status, assigneeName: step.assigneeName, completedAt: step.completedAt?.toISOString() ?? null, declineReason: step.declineReason };
  }
  if (event === "request.completed") {
    const docs = await db
      .select({ id: packageDocuments.id, finalFileId: packageDocuments.finalFileId, sha: packageDocuments.finalSha256, title: formTemplates.title })
      .from(packageDocuments)
      .innerJoin(formTemplateVersions, eq(formTemplateVersions.id, packageDocuments.templateVersionId))
      .innerJoin(formTemplates, eq(formTemplates.id, formTemplateVersions.templateId))
      .where(eq(packageDocuments.requestId, requestId))
      .orderBy(asc(packageDocuments.order));
    payload.documents = docs.filter((d) => d.finalFileId).map((d) => ({ id: d.id, title: d.title, sha256: d.sha, pdfUrl: tempFileUrl(d.id), pdfUrlExpiresInSeconds: FILE_LINK_TTL_SEC }));
    payload.answers = await collected();
  }
  return payload;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One delivery with up to 3 attempts. Returns ok + the last status/error. */
export async function deliverWebhook(hook: { url: string; secret: string }, event: string, payload: unknown, opts: { fetchImpl?: FetchLike; delays?: readonly number[] } = {}): Promise<{ ok: boolean; status?: number; error?: string; attempts: number }> {
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  const body = JSON.stringify(payload);
  const deliveryId = crypto.randomUUID();
  let last: { status?: number; error?: string } = {};
  const delays = opts.delays ?? RETRY_DELAYS_MS;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await sleep(delays[i]!);
    try {
      const res = await doFetch(hook.url, { method: "POST", headers: webhookHeaders(hook.secret, body, event, deliveryId), body, signal: AbortSignal.timeout(10_000) });
      if (res.ok) return { ok: true, status: res.status, attempts: i + 1 };
      last = { status: res.status };
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break; // the receiver rejected it: retrying won't help
    } catch (e) {
      last = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { ok: false, ...last, attempts: delays.length };
}

/** Sends the exposed events of one workflow action to every matching active webhook of the request's organization. */
export async function emitWebhooks(requestId: string, engineEvents: EngineEventLike[], opts: { fetchImpl?: FetchLike; delays?: readonly number[] } = {}): Promise<number> {
  const wanted = engineEvents.flatMap((e) => {
    const name = toWebhookEvent(e.type);
    return name ? [{ name, stepId: e.stepId }] : [];
  });
  if (wanted.length === 0) return 0;
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!req) return 0;
  const [pkgDocFormIds, hooks] = await Promise.all([
    db.select({ templateId: formTemplateVersions.templateId }).from(packageDocuments).innerJoin(formTemplateVersions, eq(formTemplateVersions.id, packageDocuments.templateVersionId)).where(eq(packageDocuments.requestId, requestId)),
    db.select().from(webhooks).where(and(eq(webhooks.organizationId, req.organizationId), eq(webhooks.active, true))),
  ]);
  const formIds = new Set(pkgDocFormIds.map((d) => d.templateId));
  const { collectedAnswers } = await import("./requests-store");
  let collectedCache: Promise<Record<string, unknown>> | null = null;
  const collected = () => (collectedCache ??= collectedAnswers(requestId));

  let sent = 0;
  for (const w of wanted) {
    const targets = hooks.filter((h) => h.events.includes(w.name) && (!h.templateId || formIds.has(h.templateId)));
    if (targets.length === 0) continue;
    const payload = await buildPayload(requestId, w.name, w.stepId, collected);
    if (!payload) continue;
    for (const h of targets) {
      const r = await deliverWebhook(h, w.name, payload, opts);
      if (r.ok) {
        sent++;
      } else {
        await db.insert(events).values({ requestId, actorType: "system", type: "webhook_failed", payload: { webhookId: h.id, url: new URL(h.url).origin, event: w.name, status: r.status ?? null, error: r.error ?? null, attempts: r.attempts } });
      }
    }
  }
  return sent;
}

// ───────────────────────── Admin ─────────────────────────

export async function listWebhooks() {
  return db.select().from(webhooks).orderBy(asc(webhooks.createdAt));
}

export async function createWebhook(input: { organizationId: string; templateId: string | null; url: string; events: WebhookEvent[] }) {
  const secret = newWebhookSecret();
  const [row] = await db.insert(webhooks).values({ ...input, secret }).returning({ id: webhooks.id });
  return { id: row!.id, secret };
}

export async function setWebhookActive(id: string, active: boolean) {
  await db.update(webhooks).set({ active }).where(eq(webhooks.id, id));
}

export async function deleteWebhook(id: string) {
  await db.delete(webhooks).where(eq(webhooks.id, id));
}

