/**
 * Request lifecycle on top of the pure engine (src/lib/workflow/engine.ts).
 * Every operation: load steps → run engine → persist steps, events, tokens and outbox rows in one batch.
 * Requester answers are given at creation (the request wizard) and stored in `apiParams.requesterAnswers`;
 * on send the requester step(s) complete immediately with them.
 */
import { asc, eq, inArray } from "drizzle-orm";
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
import type { StepRole } from "@/lib/workflow/types";

const { requests, signingSteps, stepTokens, submissions, events, notifications, packageTemplates, packageTemplateItems, packageDocuments, formTemplates, formTemplateVersions, organizations } = schema;

type StepRow = typeof signingSteps.$inferSelect;

const DEFAULT_EXPIRY_DAYS = 30;
const appUrl = () => process.env.APP_URL ?? "https://gybs-forms.vercel.app";

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
  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 86_400_000);
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
    apiParams: { requesterAnswers: input.requesterAnswers ?? {} },
  });
  if (docs.length) await db.insert(packageDocuments).values(docs.map((d) => ({ ...d, requestId: id })));
  await db.insert(events).values({ requestId: id, actorType: input.createdBy ? "user" : "system", actorId: input.createdBy, type: "request_created" });
  return id;
}

async function loadSteps(requestId: string): Promise<StepRow[]> {
  return db.select().from(signingSteps).where(eq(signingSteps.requestId, requestId)).orderBy(asc(signingSteps.order), asc(signingSteps.createdAt));
}

/** All answers collected so far (requester answers + every submission), used for skipIf and assignees. */
async function collectedAnswers(requestId: string): Promise<Answers> {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  const subs = await db.select().from(submissions).where(eq(submissions.requestId, requestId));
  const out: Answers = { ...((req?.apiParams as { requesterAnswers?: Answers } | null)?.requesterAnswers ?? {}) };
  for (const s of subs) Object.assign(out, s.answers);
  return out;
}

function inviteMessage(subjectName: string, role: string, link: string) {
  return {
    subject: `מסמכים הממתינים לך – ${subjectName}`,
    body: `שלום,\nממתין לך מסמך עבור ${subjectName} (${role}).\nלמעבר למסמך: ${link}`,
  };
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
  const writes: Promise<unknown>[] = [];

  const activatedIds = new Set(result.events.filter((e) => e.type === "step_activated").map((e) => e.stepId!));
  const tokensToLink: { stepId: string; token: string }[] = [];

  for (const s of result.steps) {
    const prev = known.get(s.id);
    const patch = stepPatch[s.id] ?? {};
    const common = {
      status: s.status,
      assigneeName: s.assigneeName ?? null,
      assigneeEmail: s.assigneeEmail ?? null,
      assigneePhone: s.assigneePhone ?? null,
      declineReason: s.declineReason ?? null,
      returnReason: s.returnReason ?? null,
      returnedToStepId: s.returnedToStepId ?? null,
      ...(activatedIds.has(s.id) ? { activatedAt: now } : {}),
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
    if (to) {
      const msg = inviteMessage(req.subjectName, s.role, `${appUrl()}/s/${token}`);
      await db.insert(notifications).values({
        organizationId: req.organizationId,
        requestId,
        stepId: id,
        channel: "email",
        to,
        templateKey: "step_invite",
        subject: msg.subject,
        body: msg.body,
      });
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
  return { request, steps, documents, events: evs };
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
      await db
        .insert(submissions)
        .values({ requestId: row.requestId, stepId, status: "submitted", answers: action.answers, submittedAt: new Date() })
        .onConflictDoUpdate({
          target: submissions.stepId,
          set: { status: "submitted", answers: action.answers, submittedAt: new Date(), savedAt: new Date() },
        });
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
  return persist(row.requestId, before, result, actor, patch);
}

export async function cancelRequest(requestId: string, reason: string, actor: { type: "user" | "api"; id?: string } = { type: "user" }) {
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
