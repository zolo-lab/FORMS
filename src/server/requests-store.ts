/**
 * Request lifecycle on top of the pure engine (src/lib/workflow/engine.ts).
 * Every operation: load steps → run engine → persist steps, events, tokens and outbox rows in one batch.
 * Requester answers are given at creation (the request wizard) and stored in `apiParams.requesterAnswers`;
 * on send the requester step(s) complete immediately with them.
 */
import { afterResponse } from "./after";
import { kickDelivery } from "./notifications";
import { nearestDue } from "@/lib/requests/list";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { createToken } from "@/lib/auth/tokens";
import type { Answers } from "@/lib/forms/conditions";
import {
  activateNext,
  cancelAll,
  completeStep,
  currentOrder,
  declineStep,
  delegate,
  expire,
  openStep,
  planSteps,
  requestStatus,
  returnTo,
  type EngineEvent,
  type EngineResult,
  type EngineStep,
} from "@/lib/workflow/engine";
import { renderDefault } from "@/lib/notifications/templates";
import { normalizeIsraeliPhone } from "@/lib/whatsapp";
import type { StepRole } from "@/lib/workflow/types";

const { requests, signingSteps, stepTokens, submissions, events, notifications, packageTemplates, packageTemplateItems, packageDocuments, formTemplates, formTemplateVersions, organizations } = schema;

type StepRow = typeof signingSteps.$inferSelect;

const DEFAULT_EXPIRY_DAYS = 30;
export const appUrl = () => process.env.APP_URL ?? "https://gybs-forms.vercel.app";

export interface Subject {
  name: string;
  idNumber?: string;
  email?: string;
  phone?: string;
}

export interface CreateRequestInput {
  packageTemplateId: string;
  organizationId: string;
  subject: Subject;
  requesterAnswers?: Answers;
  createdBy?: string;
  kind?: string;
  expiresInDays?: number;
  /** Absolute deadline (API); wins over `expiresInDays`. */
  expiresAt?: Date;
  /** Extra things the API caller wants kept with the request (stored next to the requester answers). */
  extra?: { redirectUrl?: string; custom?: Record<string, unknown> };
}

function toEngine(r: StepRow): EngineStep {
  return {
    id: r.id,
    order: r.order,
    role: r.role as StepRole,
    action: r.action,
    status: r.status,
    otpRequired: r.otpRequired,
    skipIf: r.skipIf ?? undefined,
    assigneeFromFieldId: r.assigneeFromFieldId ?? undefined,
    assigneeName: r.assigneeName ?? undefined,
    assigneeEmail: r.assigneeEmail ?? undefined,
    assigneePhone: r.assigneePhone ?? undefined,
    delegatedFromStepId: r.delegatedFromStepId ?? undefined,
    returnedToStepId: r.returnedToStepId ?? undefined,
    declineReason: r.declineReason ?? undefined,
    returnReason: r.returnReason ?? undefined,
  };
}

export async function createRequest(input: CreateRequestInput): Promise<string> {
  const [pkg] = await db.select().from(packageTemplates).where(eq(packageTemplates.id, input.packageTemplateId));
  if (!pkg) throw new Error("package template not found");
  const items = await db
    .select()
    .from(packageTemplateItems)
    .where(eq(packageTemplateItems.packageTemplateId, pkg.id))
    .orderBy(asc(packageTemplateItems.order));

  // Pin each document to the currently published version of its form.
  const docs: { templateVersionId: string; order: number }[] = [];
  for (const it of items) {
    const [t] = await db.select().from(formTemplates).where(eq(formTemplates.id, it.templateId));
    if (!t?.publishedVersion) {
      if (it.required) throw new Error(`form "${t?.title ?? it.templateId}" is not published`);
      continue;
    }
    const versions = await db.select().from(formTemplateVersions).where(eq(formTemplateVersions.templateId, it.templateId));
    const pinned = versions.find((x) => x.version === t.publishedVersion);
    if (pinned) docs.push({ templateVersionId: pinned.id, order: it.order });
  }

  const id = crypto.randomUUID();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + (input.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 86_400_000);
  await db.insert(requests).values({
    id,
    organizationId: input.organizationId,
    packageTemplateId: pkg.id,
    kind: input.kind ?? "onboarding",
    subjectName: input.subject.name,
    subjectIdNumber: input.subject.idNumber,
    subjectEmail: input.subject.email,
    subjectPhone: input.subject.phone,
    createdBy: input.createdBy,
    expiresAt,
    apiParams: { requesterAnswers: input.requesterAnswers ?? {}, ...(input.extra?.redirectUrl ? { redirectUrl: input.extra.redirectUrl } : {}), ...(input.extra?.custom ? { custom: input.extra.custom } : {}) },
  });
  if (docs.length) await db.insert(packageDocuments).values(docs.map((d) => ({ ...d, requestId: id })));
  await db.insert(events).values({ requestId: id, actorType: input.createdBy ? "user" : "system", actorId: input.createdBy, type: "request_created" });
  return id;
}

async function loadSteps(requestId: string): Promise<StepRow[]> {
  return db.select().from(signingSteps).where(eq(signingSteps.requestId, requestId)).orderBy(asc(signingSteps.order), asc(signingSteps.createdAt));
}

/** All answers collected so far (requester answers + every submission), used for skipIf and assignees. */
/**
 * Requester answers plus every *submitted* step's answers, in submission order (later steps win).
 * Drafts are autosaves that may never be submitted, so they only count for the signer who owns
 * them (`draftStepId`), e.g. to restore the form after a refresh.
 */
export async function collectedAnswers(requestId: string, opts: { draftStepId?: string } = {}): Promise<Answers> {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  const subs = await db.select().from(submissions).where(eq(submissions.requestId, requestId));
  const out: Answers = { ...((req?.apiParams as { requesterAnswers?: Answers } | null)?.requesterAnswers ?? {}) };
  const usable = subs.filter((s) => s.status === "submitted" || (opts.draftStepId !== undefined && s.stepId === opts.draftStepId));
  usable.sort((a, b) => (a.submittedAt ?? a.savedAt).getTime() - (b.submittedAt ?? b.savedAt).getTime());
  for (const s of usable) Object.assign(out, s.answers);
  return out;
}

function inviteMessage(vars: { name: string; org: string; link: string; dueDate: string }) {
  return renderDefault("step_invite", vars);
}

/**
 * Write an engine result: step rows, events, tokens + outbox rows for newly activated steps.
 * `before` is what was loaded, `result` the engine output.
 */
async function persist(
  requestId: string,
  before: StepRow[],
  result: EngineResult,
  actor: { type: "user" | "signer" | "system" | "api"; id?: string },
  stepPatch: Record<string, Partial<typeof signingSteps.$inferInsert>> = {},
) {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!req) throw new Error("request not found");
  const known = new Map(before.map((r) => [r.id, r]));
  const now = new Date();
  const [pkg] = await db.select().from(packageTemplates).where(eq(packageTemplates.id, req.packageTemplateId));
  /** When a step that just became active is due, from the route's `dueHours`. */
  const dueFor = (s: { order: number; role: string }): Date | null => {
    const h = pkg?.workflow.steps.find((w) => w.order === s.order && w.role === s.role)?.dueHours;
    return h ? new Date(now.getTime() + h * 3_600_000) : null;
  };
  const dueByStep = new Map<string, Date | null>();
  const writes: Promise<unknown>[] = [];

  const activatedIds = new Set(result.events.filter((e) => e.type === "step_activated").map((e) => e.stepId!));
  const tokensToLink: { stepId: string; token: string }[] = [];

  for (const s of result.steps) {
    const prev = known.get(s.id);
    const patch = stepPatch[s.id] ?? {};
    if (activatedIds.has(s.id)) dueByStep.set(s.id, dueFor(s));
    const common = {
      status: s.status,
      assigneeName: s.assigneeName ?? null,
      assigneeEmail: s.assigneeEmail ?? null,
      assigneePhone: s.assigneePhone ?? null,
      declineReason: s.declineReason ?? null,
      returnReason: s.returnReason ?? null,
      returnedToStepId: s.returnedToStepId ?? null,
      ...(activatedIds.has(s.id) ? { activatedAt: now, dueAt: dueByStep.get(s.id) ?? null } : {}),
      ...(s.status === "completed" && prev?.status !== "completed" ? { completedAt: now } : {}),
      ...patch,
    };
    if (prev) {
      if (prev.status !== s.status || activatedIds.has(s.id) || Object.keys(patch).length) {
        writes.push(db.update(signingSteps).set(common).where(eq(signingSteps.id, s.id)));
      }
    } else {
      writes.push(
        db.insert(signingSteps).values({
          id: s.id,
          requestId,
          order: s.order,
          parallelGroup: s.order,
          role: s.role,
          action: s.action,
          otpRequired: s.otpRequired,
          skipIf: s.skipIf,
          assigneeFromFieldId: s.assigneeFromFieldId,
          delegatedFromStepId: s.delegatedFromStepId,
          ...common,
        }),
      );
    }
  }
  await Promise.all(writes);

  // One-time links die as soon as the step stops being open (completed, returned, cancelled, delegated…).
  const closed = result.steps
    .filter((s) => (known.get(s.id)?.status === "active" || known.get(s.id)?.status === "in_progress") && s.status !== "active" && s.status !== "in_progress")
    .map((s) => s.id);
  if (closed.length) await db.update(stepTokens).set({ revokedAt: now }).where(inArray(stepTokens.stepId, closed));

  // Tokens + outbox for newly activated steps that need an outside person.
  for (const id of activatedIds) {
    const s = result.steps.find((x) => x.id === id)!;
    if (s.status !== "active" || s.role === "requester") continue;
    const { token, hash } = createToken();
    await db.insert(stepTokens).values({ stepId: id, tokenHash: hash, expiresAt: req.expiresAt });
    tokensToLink.push({ stepId: id, token });
    const to = s.assigneeEmail;
    const smsTo = !to && s.assigneePhone ? normalizeIsraeliPhone(s.assigneePhone) : null;
    if (to || smsTo) {
      const [org] = await db.select().from(organizations).where(eq(organizations.id, req.organizationId));
      const msg = inviteMessage({
        name: s.role === "employee" ? req.subjectName : (s.assigneeName ?? req.subjectName),
        org: org?.name ?? "",
        link: `${appUrl()}/s/${token}`,
        dueDate: req.expiresAt ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem" }).format(req.expiresAt) : "",
      });
      await db.insert(notifications).values({
        organizationId: req.organizationId,
        requestId,
        stepId: id,
        // Email when we have one; otherwise an SMS to the phone number.
        channel: to ? "email" : "sms",
        to: (to ?? smsTo)!,
        templateKey: "step_invite",
        subject: to ? msg.subject : null,
        body: msg.body,
      });
      await kickDelivery();
    }
  }

  const status = requestStatus(result.steps);
  const eventRows: EngineEvent[] = result.events;
  if (eventRows.length) {
    await db.insert(events).values(
      eventRows.map((e) => ({
        requestId,
        stepId: e.stepId,
        actorType: actor.type,
        actorId: actor.id,
        type: e.type,
        payload: e.payload ?? {},
      })),
    );
  }
  await db
    .update(requests)
    .set({
      status,
      currentOrder: currentOrder(result.steps),
      dueAt: nearestDue(result.steps.filter((s) => s.status === "active" || s.status === "in_progress").map((s) => (dueByStep.has(s.id) ? (dueByStep.get(s.id) ?? null) : (known.get(s.id)?.dueAt ?? null)))),
      ...(status === "completed" ? { completedAt: now } : {}),
      ...(status === "cancelled" ? { cancelledAt: now } : {}),
    })
    .where(eq(requests.id, requestId));
  return { status, tokens: tokensToLink };
}

/** draft → in_progress: plan steps, activate the first, complete requester steps with the stored answers. */
export async function sendRequest(requestId: string, actor: { type: "user" | "api"; id?: string } = { type: "user" }) {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!req) throw new Error("request not found");
  if (req.status !== "draft") throw new Error(`request is ${req.status}, not draft`);
  const [pkg] = await db.select().from(packageTemplates).where(eq(packageTemplates.id, req.packageTemplateId));
  const answers = await collectedAnswers(requestId);

  // The employee step goes to the person the request is about.
  const planned = planSteps(pkg!.workflow, answers).map((st) =>
    st.role === "employee" && !st.assigneeEmail && !st.assigneePhone
      ? { ...st, assigneeName: req.subjectName, assigneeEmail: req.subjectEmail ?? undefined, assigneePhone: req.subjectPhone ?? undefined }
      : st,
  );
  let result: EngineResult = activateNext(planned, answers);
  const evs = [...result.events];
  // Requester steps are filled by whoever created the request: complete them right away.
  for (;;) {
    const mine = result.steps.find((s) => s.role === "requester" && s.status === "active");
    if (!mine) break;
    const done = completeStep(result.steps, mine.id, answers);
    result = done;
    evs.push(...done.events);
  }
  const merged: EngineResult = { steps: result.steps, events: [{ type: "request_sent" }, ...evs] };
  const out = await persist(requestId, [], merged, actor);
  return out;
}

export async function getRequest(requestId: string) {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) return null;
  const [steps, documents, evs] = await Promise.all([
    loadSteps(requestId),
    db.select().from(packageDocuments).where(eq(packageDocuments.requestId, requestId)).orderBy(asc(packageDocuments.order)),
    db.select().from(events).where(eq(events.requestId, requestId)).orderBy(asc(events.createdAt)),
  ]);
  // Titles for display: document → pinned version → template.
  const titles = new Map<string, string>();
  for (const d of documents) {
    const [v] = await db.select().from(formTemplateVersions).where(eq(formTemplateVersions.id, d.templateVersionId));
    const [t] = v ? await db.select().from(formTemplates).where(eq(formTemplates.id, v.templateId)) : [];
    titles.set(d.id, t?.title ?? v?.definition.title ?? "מסמך");
  }
  return { request, steps, documents: documents.map((d) => ({ ...d, title: titles.get(d.id) ?? "מסמך" })), events: evs };
}

/** Another action on the same step got there first. */
export class StepConflictError extends Error {
  constructor() {
    super("step was already handled");
    this.name = "StepConflictError";
  }
}

export type StepAction =
  | { type: "open" }
  | { type: "submit"; answers: Answers }
  | { type: "decline"; reason: string }
  | { type: "return"; toStepId: string; reason: string }
  | { type: "delegate"; assignee: { name?: string; email?: string; phone?: string } };

export async function applyStepAction(stepId: string, action: StepAction, actor: { type: "signer" | "user" | "api"; id?: string } = { type: "signer" }) {
  const [row] = await db.select().from(signingSteps).where(eq(signingSteps.id, stepId));
  if (!row) throw new Error("step not found");
  const before = await loadSteps(row.requestId);
  const steps = before.map(toEngine);
  let answers = await collectedAnswers(row.requestId);
  let result: EngineResult;
  const patch: Record<string, Partial<typeof signingSteps.$inferInsert>> = {};

  switch (action.type) {
    case "open":
      result = openStep(steps, stepId);
      if (!row.firstViewedAt) patch[stepId] = { firstViewedAt: new Date() };
      break;
    case "submit": {
      answers = { ...answers, ...action.answers };
      result = completeStep(steps, stepId, answers);
      break;
    }
    case "decline":
      result = declineStep(steps, stepId, action.reason);
      break;
    case "return":
      result = returnTo(steps, stepId, action.toStepId, action.reason);
      break;
    case "delegate":
      result = delegate(steps, stepId, action.assignee);
      break;
  }
  // The new step gets its own token + invite when persist sees the activation event.
  if (action.type === "delegate") {
    const fresh = result.steps.find((s) => s.delegatedFromStepId === stepId)!;
    result = { ...result, events: [...result.events, { type: "step_activated", stepId: fresh.id, payload: { order: fresh.order, role: fresh.role } }] };
  }
  // Compare-and-set the acting step's status: of two concurrent actions on the same step only one wins,
  // so a double click or a second tab can't activate the next step twice or overwrite the first answers.
  const target = result.steps.find((s) => s.id === stepId)?.status;
  if (target && target !== row.status) {
    const won = await db.update(signingSteps).set({ status: target }).where(and(eq(signingSteps.id, stepId), eq(signingSteps.status, row.status))).returning({ id: signingSteps.id });
    if (won.length === 0) throw new StepConflictError();
  }
  if (action.type === "submit") {
    await db
      .insert(submissions)
      .values({ requestId: row.requestId, stepId, status: "submitted", answers: action.answers, submittedAt: new Date() })
      .onConflictDoUpdate({
        target: submissions.stepId,
        set: { status: "submitted", answers: action.answers, submittedAt: new Date(), savedAt: new Date() },
      });
  }
  const out = await persist(row.requestId, before, result, actor, patch);
  if (out.status === "completed") {
    // Final PDFs are generated lazily too (admin page), so a failure here must not break the signer's submit.
    try {
      const { finalizeRequest } = await import("./finalize");
      await finalizeRequest(row.requestId);
    } catch (e) {
      console.error("[finalize] failed", row.requestId, e);
    }
  }
  // Webhooks go out after the final PDFs exist (request.completed links to them) and after the response.
  const exposed = result.events.filter((e) => e.type === "request_completed" || e.type === "step_completed" || e.type === "request_declined");
  if (exposed.length) {
    await afterResponse(async () => {
      try {
        const { emitWebhooks } = await import("./webhooks");
        await emitWebhooks(row.requestId, exposed);
      } catch (e) {
        console.error("[webhooks] failed", row.requestId, e);
      }
    });
  }
  return out;
}

export async function cancelRequest(requestId: string, reason: string, actor: { type: "user" | "api"; id?: string } = { type: "user" }) {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!req) throw new Error("request not found");
  // A finished request must stay finished: cancelling it would rewrite its history.
  if (req.status !== "draft" && req.status !== "in_progress" && req.status !== "returned") throw new Error(`request is ${req.status}`);
  if (req.status === "draft") {
    // Never sent: no steps to cancel, just close the request.
    await db.update(requests).set({ status: "cancelled", cancelReason: reason, cancelledAt: new Date() }).where(and(eq(requests.id, requestId), eq(requests.status, "draft")));
    await db.insert(events).values({ requestId, actorType: actor.type, actorId: actor.id, type: "request_cancelled", payload: { reason } });
    return { status: "cancelled" as const, tokens: [] };
  }
  const before = await loadSteps(requestId);
  const result = cancelAll(before.map(toEngine), reason);
  await db.update(requests).set({ cancelReason: reason }).where(eq(requests.id, requestId));
  return persist(requestId, before, result, actor);
}

/** Cron: expire requests whose deadline passed. */
export async function expireOverdue(now = new Date()) {
  const open = await db.select().from(requests).where(inArray(requests.status, ["in_progress", "returned"]));
  let n = 0;
  for (const r of open) {
    if (r.expiresAt && r.expiresAt < now) {
      const before = await loadSteps(r.id);
      await persist(r.id, before, expire(before.map(toEngine)), { type: "system" });
      n++;
    }
  }
  return n;
}

export async function listOrganizations() {
  return db.select().from(organizations).orderBy(asc(organizations.name));
}

/**
 * A fresh one-time link for an open step; the previous link stops working. The plain token is never
 * stored, so this is how an admin gets a link to copy or share after the request was created.
 */
export async function issueLink(stepId: string): Promise<{ url: string } | null> {
  const [step] = await db.select().from(signingSteps).where(eq(signingSteps.id, stepId));
  if (!step || (step.status !== "active" && step.status !== "in_progress")) return null;
  const [req] = await db.select().from(requests).where(eq(requests.id, step.requestId));
  if (!req) return null;
  await db.update(stepTokens).set({ revokedAt: new Date() }).where(eq(stepTokens.stepId, stepId));
  const { token, hash } = createToken();
  await db.insert(stepTokens).values({ stepId, tokenHash: hash, expiresAt: req.expiresAt });
  return { url: `${appUrl()}/s/${token}` };
}

/** Pushes the deadline of an open request out by `days`; open one-time links get the new deadline too. */
export async function extendExpiry(requestId: string, days: number, actor: { type: "user" | "api"; id?: string } = { type: "user" }): Promise<Date> {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("days must be 1-365");
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!req) throw new Error("request not found");
  if (req.status !== "in_progress" && req.status !== "returned" && req.status !== "expired") throw new Error(`request is ${req.status}`);
  const base = req.expiresAt && req.expiresAt > new Date() ? req.expiresAt : new Date();
  const next = new Date(base.getTime() + days * 86_400_000);
  await db.update(requests).set({ expiresAt: next }).where(eq(requests.id, requestId));
  const open = (await loadSteps(requestId)).filter((s) => s.status === "active" || s.status === "in_progress").map((s) => s.id);
  if (open.length) await db.update(stepTokens).set({ expiresAt: next }).where(inArray(stepTokens.stepId, open));
  await db.insert(events).values({ requestId, actorType: actor.type, actorId: actor.id, type: "request_extended", payload: { days, expiresAt: next.toISOString() } });
  return next;
}

/** Admin replaces who an open step goes to. The old link stops working; get a new one with `issueLink`. */
export async function changeAssignee(stepId: string, assignee: { name?: string; email?: string; phone?: string }, actor: { type: "user" | "api"; id?: string } = { type: "user" }) {
  const [step] = await db.select().from(signingSteps).where(eq(signingSteps.id, stepId));
  if (!step || (step.status !== "active" && step.status !== "in_progress")) throw new Error("step is not open");
  await db
    .update(signingSteps)
    .set({ assigneeName: assignee.name ?? null, assigneeEmail: assignee.email ?? null, assigneePhone: assignee.phone ?? null })
    .where(eq(signingSteps.id, stepId));
  await db.update(stepTokens).set({ revokedAt: new Date() }).where(eq(stepTokens.stepId, stepId));
  await db.insert(events).values({ requestId: step.requestId, stepId, actorType: actor.type, actorId: actor.id, type: "step_assignee_changed", payload: { role: step.role } });
}
