/** Server side of the public signing page /s/[token]: resolve the link, autosave, submit. */
import { duplicateErrors } from "./unique";
import { kickDelivery } from "./notifications";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashToken } from "@/lib/auth/tokens";
import type { Answers } from "@/lib/forms/conditions";
import { mergedDefinitionForStep, type PackageDoc } from "@/lib/forms/merge";
import { roleView, type FilledItem } from "@/lib/forms/role-view";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import { allFields, type FillerRole, type FormDefinition } from "@/lib/forms/schema";
import { validateAnswers, type FieldErrors } from "@/lib/forms/validate";
import { shouldLogSave, tokenState, type TokenState } from "@/lib/workflow/signing";
import { applyStepAction, collectedAnswers, StepConflictError } from "./requests-store";
import { getFile, putFile } from "./storage";
import { checkOtp, createOtp, OTP_COOKIE_TTL_MS, OTP_MAX_ATTEMPTS, OTP_MAX_SENDS_PER_DAY, otpCookieName, otpCookieValue, verifyOtpCookie } from "@/lib/auth/otp";
import { delegateError } from "@/lib/workflow/delegate";
import { ROLE_LABELS } from "@/lib/workflow/labels";

const { stepTokens, signingSteps, requests, submissions, packageDocuments, formTemplateVersions, formTemplates, organizations, events, signatures, notifications } = schema;

export type SigningContext = {
  state: "ok";
  tokenId: string;
  step: typeof signingSteps.$inferSelect;
  request: typeof requests.$inferSelect;
  org: typeof organizations.$inferSelect;
  role: FillerRole;
  definition: FormDefinition;
  filled: FilledItem[];
  answers: Answers;
  /** Earlier completed steps this step may send the request back to. */
  returnTargets: { id: string; label: string }[];
  /** Documents that have a PDF with placed fields (for the on-document mode). */
  pdfDocs: { fileId: string; title: string; mapping: PdfMapping }[];
  /** Message shown after submit (first document that defines one). */
  thankYou?: string;
};
export type SigningLookup = SigningContext | { state: Exclude<TokenState, "ok"> };

export async function loadByToken(token: string, now = new Date()): Promise<SigningLookup> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { state: "invalid" };
  const [tok] = await db.select().from(stepTokens).where(eq(stepTokens.tokenHash, hashToken(token)));
  if (!tok) return { state: "invalid" };
  const [step] = await db.select().from(signingSteps).where(eq(signingSteps.id, tok.stepId));
  const [request] = step ? await db.select().from(requests).where(eq(requests.id, step.requestId)) : [];
  const state = tokenState({ token: tok, stepStatus: step?.status, requestStatus: request?.status, now });
  if (state !== "ok" || !step || !request) return { state: state === "ok" ? "invalid" : state };

  const [org] = await db.select().from(organizations).where(eq(organizations.id, request.organizationId));
  const docRows = await db
    .select({ order: packageDocuments.order, definition: formTemplateVersions.definition, title: formTemplates.title, pdfFileId: formTemplateVersions.pdfFileId, pdfMapping: formTemplateVersions.pdfMapping })
    .from(packageDocuments)
    .innerJoin(formTemplateVersions, eq(formTemplateVersions.id, packageDocuments.templateVersionId))
    .innerJoin(formTemplates, eq(formTemplates.id, formTemplateVersions.templateId))
    .where(eq(packageDocuments.requestId, request.id))
    .orderBy(packageDocuments.order);
  const docs: PackageDoc[] = docRows.map((d) => ({ title: d.title, definition: d.definition }));
  const role = step.role as FillerRole;
  const answers = await collectedAnswers(request.id, { draftStepId: step.id });
  const merged = docs.length ? mergedDefinitionForStep(docs, role) : { schemaVersion: 1 as const, title: request.subjectName, pages: [] };
  const view = roleView(merged, answers, role);

  const pdfDocs = docRows.flatMap((d) => (d.pdfFileId && d.pdfMapping ? [{ fileId: d.pdfFileId, title: d.title, mapping: d.pdfMapping }] : []));
  const siblings = await db.select().from(signingSteps).where(eq(signingSteps.requestId, request.id)).orderBy(signingSteps.order);
  const returnTargets = siblings
    .filter((s) => s.order < step.order && s.status === "completed" && s.role !== "requester") // the requester has no signing link, so a request returned to them would be stuck
    .map((s) => ({ id: s.id, label: `${ROLE_LABELS[s.role as FillerRole] ?? s.role}${s.assigneeName ? ` – ${s.assigneeName}` : ""}` }));

  await db.update(stepTokens).set({ lastUsedAt: now }).where(eq(stepTokens.id, tok.id));
  return { state: "ok", tokenId: tok.id, step, request, org: org!, role, definition: view.definition, filled: view.filled, answers, returnTargets, pdfDocs, thankYou: docs.map((d) => d.definition.settings?.thankYou).find((t) => !!t) };
}

/** Marks the step as opened (active → in_progress) the first time the link is visited. */
export async function markOpened(ctx: SigningContext, meta: { ip?: string; userAgent?: string }) {
  if (ctx.step.status === "active") {
    // Two tabs opening the link at once: the loser just carries on.
    await applyStepAction(ctx.step.id, { type: "open" }).catch((e) => {
      if (!(e instanceof StepConflictError)) throw e;
    });
  }
  if (!ctx.step.signerIp && (meta.ip || meta.userAgent)) {
    await db.update(signingSteps).set({ signerIp: meta.ip, signerUserAgent: meta.userAgent }).where(eq(signingSteps.id, ctx.step.id));
  }
}

/** Only answers to fields this signer owns are accepted. */
function ownAnswers(def: FormDefinition, input: Answers): Answers {
  const own = new Set(allFields(def).map((f) => f.id));
  return Object.fromEntries(Object.entries(input).filter(([k]) => own.has(k)));
}

export async function saveDraft(token: string, input: Answers, cookieHeader: string | null = null): Promise<{ ok: boolean; state?: TokenState | "otp_required" }> {
  const ctx = await loadByToken(token);
  if (ctx.state !== "ok") return { ok: false, state: ctx.state };
  if (!otpPassed(ctx, cookieHeader)) return { ok: false, state: "otp_required" };
  const answers = ownAnswers(ctx.definition, input);
  const now = new Date();
  await db
    .insert(submissions)
    .values({ requestId: ctx.request.id, stepId: ctx.step.id, status: "draft", answers })
    .onConflictDoUpdate({ target: submissions.stepId, set: { answers, savedAt: now } });
  const [last] = await db
    .select({ at: events.createdAt })
    .from(events)
    .where(and(eq(events.stepId, ctx.step.id), eq(events.type, "step_saved")))
    .orderBy(desc(events.createdAt))
    .limit(1);
  if (shouldLogSave(last?.at ?? null, now)) {
    await db.insert(events).values({ requestId: ctx.request.id, stepId: ctx.step.id, actorType: "signer", type: "step_saved", payload: {} });
  }
  return { ok: true };
}

export type DoneInfo = { message?: string; waitingFor: string[]; completed: boolean };
/** After a step is finished: what the signer should be told. */
async function doneInfo(ctx: SigningContext, status: string): Promise<DoneInfo> {
  const open = await db.select().from(signingSteps).where(and(eq(signingSteps.requestId, ctx.request.id), eq(signingSteps.status, "active")));
  return {
    message: ctx.thankYou,
    completed: status === "completed",
    waitingFor: open.map((s) => `${ROLE_LABELS[s.role as FillerRole] ?? s.role}${s.assigneeName ? ` – ${s.assigneeName}` : ""}`),
  };
}

export type SubmitResult = ({ ok: true } & DoneInfo) | { ok: false; errors: FieldErrors } | { ok: false; state: TokenState | "otp_required" };

export async function submit(token: string, input: Answers, cookieHeader: string | null = null): Promise<SubmitResult> {
  const ctx = await loadByToken(token);
  if (ctx.state !== "ok") return { ok: false, state: ctx.state };
  if (!otpPassed(ctx, cookieHeader)) return { ok: false, state: "otp_required" };
  const mine = ownAnswers(ctx.definition, input);
  // Conditions may depend on earlier steps' answers, so validate against everything known.
  const result = validateAnswers(ctx.definition, { ...ctx.answers, ...mine }, { role: ctx.role });
  if (!result.ok) return { ok: false, errors: result.errors };
  const cleaned = ownAnswers(ctx.definition, result.cleaned);
  const duplicates = await duplicateErrors(ctx.request.id, ctx.definition, cleaned);
  if (Object.keys(duplicates).length) return { ok: false, errors: duplicates };

  for (const f of allFields(ctx.definition)) {
    if (f.type !== "signature") continue;
    const sig = cleaned[f.id] as { image?: string; kind?: string; text?: string } | undefined;
    const image = sig?.image;
    const m = image ? /^data:image\/png;base64,(.+)$/.exec(image) : null;
    if (!m) continue;
    const file = await putFile({ name: `signature-${ctx.step.id}-${f.id}.png`, mime: "image/png", bytes: new Uint8Array(Buffer.from(m[1]!, "base64")) });
    await db.insert(signatures).values({ stepId: ctx.step.id, fieldId: f.id, kind: sig?.kind === "typed" ? "typed" : "drawn", fileId: file.id, typedText: sig?.kind === "typed" ? (sig.text ?? null) : null });
  }
  try {
    const out = await applyStepAction(ctx.step.id, { type: "submit", answers: cleaned }, { type: "signer" });
    return { ok: true, ...(await doneInfo(ctx, out.status)) };
  } catch (e) {
    if (e instanceof StepConflictError) return { ok: false, state: "closed" };
    throw e;
  }
}

// ───────────────────────── OTP ─────────────────────────

const secret = () => process.env.SESSION_SECRET ?? "";

function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** True when the step needs no OTP, or this browser already passed it. */
export function otpPassed(ctx: SigningContext, cookieHeader: string | null | undefined): boolean {
  if (!ctx.step.otpRequired) return true;
  return verifyOtpCookie(secret(), ctx.step.id, readCookie(cookieHeader, otpCookieName(ctx.step.id)));
}

export type OtpSendResult = { ok: true; sentTo: string } | { ok: false; reason: "no_email" | "too_soon" | "daily_limit" | TokenState };

export async function sendOtp(token: string, now = new Date()): Promise<OtpSendResult> {
  const ctx = await loadByToken(token, now);
  if (ctx.state !== "ok") return { ok: false, reason: ctx.state };
  const email = ctx.step.assigneeEmail;
  if (!email) return { ok: false, reason: "no_email" };
  // Resend cooldown: 60 seconds.
  if (ctx.step.otpExpiresAt && ctx.step.otpExpiresAt.getTime() - now.getTime() > 9 * 60_000) return { ok: false, reason: "too_soon" };
  // At most N codes per step per day: together with the attempt cap this bounds guessing.
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const sent = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.stepId, ctx.step.id), eq(events.type, "otp_sent"), gte(events.createdAt, since)));
  if (sent.length >= OTP_MAX_SENDS_PER_DAY) return { ok: false, reason: "daily_limit" };
  const otp = createOtp(ctx.step.id, now);
  await db.update(signingSteps).set({ otpHash: otp.hash, otpExpiresAt: otp.expiresAt, otpAttempts: 0 }).where(eq(signingSteps.id, ctx.step.id));
  await db.insert(notifications).values({
    organizationId: ctx.request.organizationId,
    requestId: ctx.request.id,
    stepId: ctx.step.id,
    channel: "email",
    to: email,
    templateKey: "otp",
    subject: "קוד אימות",
    body: `קוד האימות שלך: ${otp.code}\nהקוד תקף ל-10 דקות.`,
  });
  await kickDelivery();
  await db.insert(events).values({ requestId: ctx.request.id, stepId: ctx.step.id, actorType: "signer", type: "otp_sent", payload: {} });
  return { ok: true, sentTo: email.replace(/^(.).*(@.*)$/, "$1***$2") };
}

export type OtpVerifyResult = { ok: true; cookie: { name: string; value: string; maxAgeSeconds: number } } | { ok: false; reason: "wrong" | "expired" | "locked" | "missing" | TokenState };

export async function verifyOtp(token: string, code: string, now = new Date()): Promise<OtpVerifyResult> {
  const ctx = await loadByToken(token, now);
  if (ctx.state !== "ok") return { ok: false, reason: ctx.state };
  // Claim an attempt atomically *before* comparing: parallel guesses can't share one counter value.
  const claimed = await db
    .update(signingSteps)
    .set({ otpAttempts: sql`${signingSteps.otpAttempts} + 1` })
    .where(and(eq(signingSteps.id, ctx.step.id), lt(signingSteps.otpAttempts, OTP_MAX_ATTEMPTS)))
    .returning({ attempts: signingSteps.otpAttempts });
  if (claimed.length === 0) return { ok: false, reason: "locked" };
  const r = checkOtp({ hash: ctx.step.otpHash, expiresAt: ctx.step.otpExpiresAt, attempts: 0, code: code.trim(), stepId: ctx.step.id, now });
  if (r !== "ok") return { ok: false, reason: r };
  await db.update(signingSteps).set({ otpHash: null, otpExpiresAt: null, otpAttempts: 0 }).where(eq(signingSteps.id, ctx.step.id));
  await db.insert(events).values({ requestId: ctx.request.id, stepId: ctx.step.id, actorType: "signer", type: "otp_verified", payload: {} });
  return {
    ok: true,
    cookie: { name: otpCookieName(ctx.step.id), value: otpCookieValue(secret(), ctx.step.id, now.getTime() + OTP_COOKIE_TTL_MS), maxAgeSeconds: OTP_COOKIE_TTL_MS / 1000 },
  };
}

// ───────────────────────── Approver actions ─────────────────────────

export type SignerAction =
  | { type: "decline"; reason: string }
  | { type: "return"; toStepId: string; reason: string }
  | { type: "delegate"; assignee: { name: string; email?: string; phone?: string } };

export async function performAction(token: string, cookieHeader: string | null, action: SignerAction): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ctx = await loadByToken(token);
  if (ctx.state !== "ok") return { ok: false, reason: ctx.state };
  if (!otpPassed(ctx, cookieHeader)) return { ok: false, reason: "otp_required" };
  try {
    if (action.type === "return" && !ctx.returnTargets.some((t) => t.id === action.toStepId)) return { ok: false, reason: "bad_target" };
    if (action.type === "delegate") {
      const bad = delegateError(action.assignee);
      if (bad) return { ok: false, reason: bad };
    }
    await applyStepAction(ctx.step.id, action, { type: "signer" });
    return { ok: true };
  } catch (e) {
    if (e instanceof StepConflictError) return { ok: false, reason: "closed" };
    return { ok: false, reason: e instanceof Error ? e.message : "failed" };
  }
}

/** Blank template PDF bytes for the on-document mode; only files that belong to this request's documents. */
export async function getPdfForToken(token: string, fileId: string): Promise<{ bytes: Uint8Array } | null> {
  const ctx = await loadByToken(token);
  if (ctx.state !== "ok" || !ctx.pdfDocs.some((d) => d.fileId === fileId)) return null;
  const [row] = await db.select().from(schema.pdfFiles).where(eq(schema.pdfFiles.id, fileId));
  const storedId = row ? /([0-9a-f-]{36})$/.exec(row.blobUrl)?.[1] : undefined;
  const file = storedId ? await getFile(storedId) : null;
  return file ? { bytes: file.bytes } : null;
}
