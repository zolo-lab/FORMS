/** Server side of the public signing page /s/[token]: resolve the link, autosave, submit. */
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashToken } from "@/lib/auth/tokens";
import type { Answers } from "@/lib/forms/conditions";
import { mergedDefinitionForStep, type PackageDoc } from "@/lib/forms/merge";
import { roleView, type FilledItem } from "@/lib/forms/role-view";
import { allFields, type FillerRole, type FormDefinition } from "@/lib/forms/schema";
import { validateAnswers, type FieldErrors } from "@/lib/forms/validate";
import { shouldLogSave, tokenState, type TokenState } from "@/lib/workflow/signing";
import { applyStepAction, collectedAnswers } from "./requests-store";
import { putFile } from "./storage";

const { stepTokens, signingSteps, requests, submissions, packageDocuments, formTemplateVersions, formTemplates, organizations, events, signatures } = schema;

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
    .select({ order: packageDocuments.order, definition: formTemplateVersions.definition, title: formTemplates.title })
    .from(packageDocuments)
    .innerJoin(formTemplateVersions, eq(formTemplateVersions.id, packageDocuments.templateVersionId))
    .innerJoin(formTemplates, eq(formTemplates.id, formTemplateVersions.templateId))
    .where(eq(packageDocuments.requestId, request.id))
    .orderBy(packageDocuments.order);
  const docs: PackageDoc[] = docRows.map((d) => ({ title: d.title, definition: d.definition }));
  const role = step.role as FillerRole;
  const answers = await collectedAnswers(request.id);
  const merged = docs.length ? mergedDefinitionForStep(docs, role) : { schemaVersion: 1 as const, title: request.subjectName, pages: [] };
  const view = roleView(merged, answers, role);

  await db.update(stepTokens).set({ lastUsedAt: now }).where(eq(stepTokens.id, tok.id));
  return { state: "ok", tokenId: tok.id, step, request, org: org!, role, definition: view.definition, filled: view.filled, answers };
}

/** Marks the step as opened (active → in_progress) the first time the link is visited. */
export async function markOpened(ctx: SigningContext, meta: { ip?: string; userAgent?: string }) {
  if (ctx.step.status === "active") await applyStepAction(ctx.step.id, { type: "open" });
  if (!ctx.step.signerIp && (meta.ip || meta.userAgent)) {
    await db.update(signingSteps).set({ signerIp: meta.ip, signerUserAgent: meta.userAgent }).where(eq(signingSteps.id, ctx.step.id));
  }
}

/** Only answers to fields this signer owns are accepted. */
function ownAnswers(def: FormDefinition, input: Answers): Answers {
  const own = new Set(allFields(def).map((f) => f.id));
  return Object.fromEntries(Object.entries(input).filter(([k]) => own.has(k)));
}

export async function saveDraft(token: string, input: Answers): Promise<{ ok: boolean; state?: TokenState }> {
  const ctx = await loadByToken(token);
  if (ctx.state !== "ok") return { ok: false, state: ctx.state };
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

export type SubmitResult = { ok: true } | { ok: false; errors: FieldErrors } | { ok: false; state: TokenState };

export async function submit(token: string, input: Answers): Promise<SubmitResult> {
  const ctx = await loadByToken(token);
  if (ctx.state !== "ok") return { ok: false, state: ctx.state };
  const mine = ownAnswers(ctx.definition, input);
  // Conditions may depend on earlier steps' answers, so validate against everything known.
  const result = validateAnswers(ctx.definition, { ...ctx.answers, ...mine }, { role: ctx.role });
  if (!result.ok) return { ok: false, errors: result.errors };
  const cleaned = ownAnswers(ctx.definition, result.cleaned);

  for (const f of allFields(ctx.definition)) {
    if (f.type !== "signature") continue;
    const sig = cleaned[f.id] as { image?: string; kind?: string; text?: string } | undefined;
    const image = sig?.image;
    const m = image ? /^data:image\/png;base64,(.+)$/.exec(image) : null;
    if (!m) continue;
    const file = await putFile({ name: `signature-${ctx.step.id}-${f.id}.png`, mime: "image/png", bytes: new Uint8Array(Buffer.from(m[1]!, "base64")) });
    await db.insert(signatures).values({ stepId: ctx.step.id, fieldId: f.id, kind: sig?.kind === "typed" ? "typed" : "drawn", fileId: file.id, typedText: sig?.kind === "typed" ? (sig.text ?? null) : null });
  }
  await applyStepAction(ctx.step.id, { type: "submit", answers: cleaned }, { type: "signer" });
  return { ok: true };
}
