/**
 * The form's own link (/f/<form id>): the published form, as its first step fills it, open to anyone with the link.
 * Nothing is created until it is sent; then a request is opened, the first step is submitted through the usual signing
 * code (same validation, signatures, PDF), and the next steps go on by themselves.
 */
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Answers } from "@/lib/forms/conditions";
import { mergedDefinitionForStep } from "@/lib/forms/merge";
import { roleView } from "@/lib/forms/role-view";
import type { FormDefinition } from "@/lib/forms/schema";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import { validateAnswers, type FieldErrors } from "@/lib/forms/validate";
import { publicStart, subjectFromAnswers } from "@/lib/forms/public-link";
import { createToken } from "@/lib/auth/tokens";
import { OTP_COOKIE_TTL_MS, otpCookieName, otpCookieValue } from "@/lib/auth/otp";
import { getFile } from "./storage";
import { formPackageId } from "./packages-store";
import { createRequest, sendRequest } from "./requests-store";
import { submit } from "./signing";

const UUID = /^[0-9a-f-]{36}$/i;

export type PublicForm =
  | { ok: true; formId: string; title: string; role: "requester" | "employee"; definition: FormDefinition; pdf?: { fileId: string; mapping: PdfMapping }; packageId: string; organizationId: string | null }
  | { ok: false; title?: string; reason: "not_found" | "closed" | "not_public" };

export async function publicForm(formId: string): Promise<PublicForm> {
  if (!UUID.test(formId)) return { ok: false, reason: "not_found" };
  const [form] = await db.select().from(schema.formTemplates).where(eq(schema.formTemplates.id, formId));
  if (!form) return { ok: false, reason: "not_found" };
  if (!form.publishedVersion || form.status === "archived") return { ok: false, title: form.title, reason: "closed" };
  const [version] = await db
    .select()
    .from(schema.formTemplateVersions)
    .where(and(eq(schema.formTemplateVersions.templateId, formId), eq(schema.formTemplateVersions.version, form.publishedVersion)));
  if (!version) return { ok: false, title: form.title, reason: "closed" };
  const [pkg] = await db.select().from(schema.packageTemplates).where(eq(schema.packageTemplates.id, await formPackageId(formId)));
  const start = publicStart(pkg?.workflow.steps ?? []);
  if (!pkg || pkg.archivedAt) return { ok: false, title: form.title, reason: "closed" };
  if (!start.ok) return { ok: false, title: form.title, reason: "not_public" };
  const merged = mergedDefinitionForStep([{ title: form.title, definition: version.definition }], start.role);
  const definition = roleView(merged, {}, start.role).definition;
  const pdf = version.pdfFileId && version.pdfMapping ? { fileId: version.pdfFileId, mapping: version.pdfMapping } : undefined;
  return { ok: true, formId, title: form.title, role: start.role, definition, pdf, packageId: pkg.id, organizationId: pkg.organizationId };
}

/** The published form's own document, for the link's on-document view. */
export async function publicFormPdf(formId: string): Promise<Uint8Array | null> {
  const view = await publicForm(formId);
  if (!view.ok || !view.pdf) return null;
  const [row] = await db.select().from(schema.pdfFiles).where(eq(schema.pdfFiles.id, view.pdf.fileId));
  const storedId = row ? /([0-9a-f-]{36})$/.exec(row.blobUrl)?.[1] : undefined;
  const file = storedId ? await getFile(storedId) : null;
  return file?.bytes ?? null;
}

export type PublicSubmitResult =
  | { ok: true; message?: string; waitingFor: string[]; completed: boolean }
  | { ok: false; errors: FieldErrors }
  | { ok: false; error: "not_found" | "closed" | "not_public" | "no_organization" | "failed" };

export async function publicSubmit(formId: string, input: Answers): Promise<PublicSubmitResult> {
  const view = await publicForm(formId);
  if (!view.ok) return { ok: false, error: view.reason };
  // Check before anything is created, so a form with mistakes leaves nothing behind.
  const check = validateAnswers(view.definition, input, { role: view.role });
  if (!check.ok) return { ok: false, errors: check.errors };

  // The form's organization (set in the form's settings); a form not bound to one goes to the first active one.
  const [org] = view.organizationId
    ? await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, view.organizationId))
    : await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.active, true)).orderBy(asc(schema.organizations.name)).limit(1);
  if (!org) return { ok: false, error: "no_organization" };

  const subject = subjectFromAnswers(view.definition, check.cleaned);
  const requestId = await createRequest({
    packageTemplateId: view.packageId,
    organizationId: org.id,
    subject: { ...subject, name: subject.name || view.title },
    ...(view.role === "requester" ? { requesterAnswers: check.cleaned } : {}),
  });
  const sent = await sendRequest(requestId, { type: "api" }, { requesterByLink: view.role === "requester" });
  const [first] = await db
    .select()
    .from(schema.signingSteps)
    .where(and(eq(schema.signingSteps.requestId, requestId), eq(schema.signingSteps.status, "active")))
    .orderBy(asc(schema.signingSteps.order))
    .limit(1);
  if (!first) return { ok: false, error: "failed" };
  let token = sent.tokens.find((t) => t.stepId === first.id)?.token;
  if (!token) {
    const made = createToken();
    const [req] = await db.select({ expiresAt: schema.requests.expiresAt }).from(schema.requests).where(eq(schema.requests.id, requestId));
    await db.insert(schema.stepTokens).values({ stepId: first.id, tokenHash: made.hash, expiresAt: req?.expiresAt ?? null });
    token = made.token;
  }
  // Whoever filled the link is the one this step is for: no one-time code on top.
  const secret = process.env.SESSION_SECRET ?? "";
  const cookie = first.otpRequired && secret ? `${otpCookieName(first.id)}=${encodeURIComponent(otpCookieValue(secret, first.id, Date.now() + OTP_COOKIE_TTL_MS))}` : null;
  const r = await submit(token, input, cookie);
  if (r.ok) return { ok: true, message: r.message, waitingFor: r.waitingFor, completed: r.completed };
  // Should not happen (checked above): do not leave a half-made request behind.
  await db.delete(schema.requests).where(eq(schema.requests.id, requestId));
  return "errors" in r ? { ok: false, errors: r.errors } : { ok: false, error: "failed" };
}
