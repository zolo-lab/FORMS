/**
 * The form's own link (/f/<form id>): the published form, as its first step fills it, open to anyone with the link.
 * Nothing is created until it is sent; then a request is opened, the first step is submitted through the usual signing
 * code (same validation, signatures, PDF), and the next steps go on by themselves.
 */
import { linkExpiryOf } from "@/lib/requests/expiry";
import { routeFor } from "@/lib/workflow/assignee";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Answers } from "@/lib/forms/conditions";
import { mergedDefinitionForStep } from "@/lib/forms/merge";
import { roleView } from "@/lib/forms/role-view";
import type { FormDefinition } from "@/lib/forms/schema";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import { validateAnswers, type FieldErrors } from "@/lib/forms/validate";
import { allowedOrgs, linkOrg, linkProject, publicRole, publicStart, subjectFromAnswers } from "@/lib/forms/public-link";
import { lockOrgFields, withOrgFields } from "@/lib/forms/prefill";
import { lockListFields, withOrgOptions } from "@/lib/forms/linked";
import { listLookupsFor, orgListFields } from "@/server/lists-store";
import { createToken } from "@/lib/auth/tokens";
import { OTP_COOKIE_TTL_MS, otpCookieName, otpCookieValue } from "@/lib/auth/otp";
import { getFile } from "./storage";
import { formPackageId } from "./packages-store";
import { createRequest, sendRequest } from "./requests-store";
import { submit } from "./signing";

const UUID = /^[0-9a-f-]{36}$/i;

export type PublicOrg = { id: string; name: string; slug: string | null; registrationNumber: string; primaryColor: string | null; logoFileId: string | null; fieldValues: Record<string, string> };

export type PublicForm =
  | { ok: true; formId: string; title: string; role: "requester" | "employee"; definition: FormDefinition; pdf?: { fileId: string; mapping: PdfMapping }; packageId: string; org: PublicOrg; project: { id: string; name: string } | null; initialAnswers: Answers }
  | { ok: false; title?: string; reason: "not_found" | "closed" | "not_public" | "no_fields" | "choose_org" | "org_not_allowed" | "no_organization" };

/**
 * The form as opened from its link. `orgSlug` is the organization in the link (/f/<form>/<slug>); without one, the
 * form must be open to a single organization.
 */
export async function publicForm(formId: string, orgSlug?: string | null, projectSlug?: string | null): Promise<PublicForm> {
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
  if (!pkg || pkg.archivedAt) return { ok: false, title: form.title, reason: "closed" };
  const orgs = await db.select().from(schema.organizations);
  const which = linkOrg(allowedOrgs(pkg, orgs), orgSlug);
  if (!which.ok) return { ok: false, title: form.title, reason: which.reason };
  // The organization's own route when it has one.
  // A project in the link (/f/<form>/<organization>/<project>): the request is filed under it and follows its route.
  const proj = linkProject(await db.select().from(schema.projects).where(eq(schema.projects.organizationId, which.org.id)), projectSlug);
  if (!proj.ok) return { ok: false, title: form.title, reason: proj.reason };
  const project = proj.project ? { id: proj.project.id, name: proj.project.name } : null;
  const route = routeFor(pkg, which.org.id, project?.id);
  const start = publicStart(route.steps);
  if (!start.ok) return { ok: false, title: form.title, reason: "not_public" };
  const o = which.org;
  const org: PublicOrg = { id: o.id, name: o.name, slug: o.slug, registrationNumber: o.registrationNumber, primaryColor: o.primaryColor, logoFileId: o.logoFileId, fieldValues: o.fieldValues ?? {} };
  const viewFor = (role: "requester" | "employee") => roleView(mergedDefinitionForStep([{ title: form.title, definition: version.definition }], role), {}, role).definition;
  const role = publicRole(route.steps, (r) => viewFor(r).pages.length > 0);
  if (!role) return { ok: false, title: form.title, reason: "no_fields" };
  // Choices linked to the organizations' list show this organization's options only (and are checked against them).
  // Fields filled from a list picked in the form are locked too: the record's value, not the filler's.
  const definition = lockListFields(withOrgOptions(lockOrgFields(viewFor(role)), org.fieldValues, await orgListFields()));
  const pdf = version.pdfFileId && version.pdfMapping ? { fileId: version.pdfFileId, mapping: version.pdfMapping } : undefined;
  const initialAnswers = withOrgFields(definition, { name: org.name, registrationNumber: org.registrationNumber, fields: org.fieldValues }, {});
  return { ok: true, formId, title: form.title, role, definition, pdf, packageId: pkg.id, org, project, initialAnswers };
}

/** The published form's own document, for the link's on-document view. */
export async function publicFormPdf(formId: string, orgSlug?: string | null, projectSlug?: string | null): Promise<Uint8Array | null> {
  const view = await publicForm(formId, orgSlug, projectSlug);
  if (!view.ok || !view.pdf) return null;
  const [row] = await db.select().from(schema.pdfFiles).where(eq(schema.pdfFiles.id, view.pdf.fileId));
  const storedId = row ? /([0-9a-f-]{36})$/.exec(row.blobUrl)?.[1] : undefined;
  const file = storedId ? await getFile(storedId) : null;
  return file?.bytes ?? null;
}

export type PublicSubmitResult =
  | { ok: true; message?: string; waitingFor: string[]; completed: boolean }
  | { ok: false; errors: FieldErrors }
  | { ok: false; error: "not_found" | "closed" | "not_public" | "no_fields" | "no_organization" | "choose_org" | "org_not_allowed" | "failed" };

export async function publicSubmit(formId: string, rawInput: Answers, orgSlug?: string | null, projectSlug?: string | null): Promise<PublicSubmitResult> {
  const view = await publicForm(formId, orgSlug, projectSlug);
  if (!view.ok) return { ok: false, error: view.reason };
  const org = view.org;
  // The organization comes from the link, never from what was sent.
  const input = withOrgFields(view.definition, { name: org.name, registrationNumber: org.registrationNumber, fields: org.fieldValues }, rawInput);
  // Check before anything is created, so a form with mistakes leaves nothing behind.
  // The lookups the form was shown with: a list picked in it fills its fields from the record, here as there.
  const check = validateAnswers(view.definition, input, { role: view.role, lookups: await listLookupsFor([view.definition]) });
  if (!check.ok) return { ok: false, errors: check.errors };

  const subject = subjectFromAnswers(view.definition, check.cleaned);
  const requestId = await createRequest({
    ...(view.project ? { projectId: view.project.id } : {}),
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
    await db.insert(schema.stepTokens).values({ stepId: first.id, tokenHash: made.hash, expiresAt: linkExpiryOf(first, { expiresAt: req?.expiresAt ?? null }) });
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

/** The organizations each form's link opens for (its own package's ticked organizations), for the links in the admin. */
export type LinkTarget = { slug: string; name: string; projects: { slug: string; name: string }[] };

export async function formLinkOrgs(templateIds: string[]): Promise<Map<string, LinkTarget[]>> {
  const out = new Map<string, LinkTarget[]>();
  if (!templateIds.length) return out;
  const items = await db.select().from(schema.packageTemplateItems).where(inArray(schema.packageTemplateItems.templateId, templateIds));
  const sizes = new Map<string, number>();
  const all = items.length ? await db.select().from(schema.packageTemplateItems).where(inArray(schema.packageTemplateItems.packageTemplateId, [...new Set(items.map((i) => i.packageTemplateId))])) : [];
  for (const i of all) sizes.set(i.packageTemplateId, (sizes.get(i.packageTemplateId) ?? 0) + 1);
  const own = new Map<string, string>();
  for (const i of items) if (sizes.get(i.packageTemplateId) === 1) own.set(i.templateId, i.packageTemplateId);
  const pkgs = own.size ? await db.select().from(schema.packageTemplates).where(inArray(schema.packageTemplates.id, [...own.values()])) : [];
  const orgs = await db.select().from(schema.organizations);
  const projects = (await db.select().from(schema.projects)).filter((p) => p.active && p.slug);
  for (const [templateId, pkgId] of own) {
    const pkg = pkgs.find((p) => p.id === pkgId);
    if (!pkg) continue;
    out.set(
      templateId,
      allowedOrgs(pkg, orgs)
        .filter((o) => o.slug)
        .map((o) => ({ slug: o.slug!, name: o.name, projects: projects.filter((p) => p.organizationId === o.id).map((p) => ({ slug: p.slug!, name: p.name })) })),
    );
  }
  return out;
}
