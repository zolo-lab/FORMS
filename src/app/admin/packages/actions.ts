"use server";
import { requireGrant } from "@/server/guards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseStepForm } from "@/lib/workflow/step-form";
import { assignRoles, sanitizeDraft, stepFromDraft, type StepDraft } from "@/lib/workflow/step-who";
import { validateWorkflow } from "@/lib/workflow/validate-workflow";
import { draftProblems, emailFieldsOf } from "@/lib/workflow/step-fields";
import { getEditorData } from "@/server/forms-store";
import { addDocument, createPackage, getPackage, moveDocument, removeDocument, setArchived, setDocumentRequired, setOrgWorkflows, setProcessing, setWorkflow, updatePackage, updatePackageSettings } from "@/server/packages-store";
import { normalizeExpiryRule } from "@/lib/requests/expiry";
import { normalizeFollowUpStatuses, parseFollowUpStatuses } from "@/lib/requests/follow-up";
import { parseRecipients } from "@/lib/requests/recipients";
import { normalizeProcessing, splitProcessing } from "@/lib/processing/model";

const UUID = /^[0-9a-f-]{36}$/i;
/** Back to where the edit came from: the form's "שלבי הטופס" page when it was opened there, else the package page. */
const back = (id: string, q = "", fd?: FormData) => {
  const to = String(fd?.get("returnTo") ?? "");
  redirect(`${/^\/admin\/forms\/[0-9a-f-]{36}\/flow$/i.test(to) ? to : `/admin/packages/${id}`}${q}`);
};

function pkgId(fd: FormData): string {
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) redirect("/admin/packages");
  return id;
}

export async function createPackageAction(fd: FormData) {
  await requireGrant("manageForms");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) redirect("/admin/packages?error=name");
  const id = await createPackage(name);
  revalidatePath("/admin/packages");
  back(id, "", fd);
}

export async function savePackageAction(fd: FormData) {
  await requireGrant("manageForms");
  const id = pkgId(fd);
  const name = String(fd.get("name") ?? "").trim();
  if (!name) back(id, "?error=name", fd);
  // "זמין לעמותות": ticked organizations (one = the form belongs to it). The older single choice still works.
  const ticked = [...new Set(fd.getAll("organizationIds").map(String).filter((v) => UUID.test(v)))];
  const org = String(fd.get("organizationId") ?? "");
  const organizationIds = fd.has("orgsField") ? ticked : UUID.test(org) ? [org] : [];
  await updatePackage(id, {
    name,
    description: String(fd.get("description") ?? "").trim() || null,
    organizationId: organizationIds.length === 1 ? organizationIds[0]! : null,
    organizationIds,
  });
  revalidatePath(`/admin/packages/${id}`);
  revalidatePath("/admin/forms", "layout");
  back(id, "?saved=org", fd);
}

export async function savePackageSettingsAction(fd: FormData) {
  await requireGrant("manageForms");
  const id = pkgId(fd);
  const data = await getPackage(id);
  if (!data) redirect("/admin/packages");
  const kind = String(fd.get("expiryKind") ?? "default");
  const rule =
    kind === "none" ? { kind: "none" }
    : kind === "days" ? { kind: "days", days: Number(fd.get("expiryDays")) }
    : kind === "dayOfNextMonth" ? { kind: "dayOfNextMonth", day: Number(fd.get("expiryDay")), dateFieldId: String(fd.get("expiryField") ?? "") }
    : null;
  const expiryRule = normalizeExpiryRule(rule);
  if (kind !== "default" && !expiryRule) back(id, "?settingsError=expiry", fd);
  const recipients = parseRecipients(String(fd.get("recipients") ?? ""));
  if (recipients.invalid.length) back(id, `?settingsError=${encodeURIComponent(recipients.invalid.join(", "))}`, fd);
  await updatePackageSettings(id, {
    expiryRule,
    completionRecipients: recipients.valid,
    followUpStatuses: parseFollowUpStatuses(String(fd.get("followUp") ?? ""), normalizeFollowUpStatuses(data!.pkg.followUpStatuses)),
    remindersEnabled: fd.get("remindersEnabled") === "on",
    mailNote: String(fd.get("mailNote") ?? "").trim().slice(0, 500) || null,
  });
  revalidatePath(`/admin/packages/${id}`);
  revalidatePath("/admin/forms", "layout");
  back(id, "?saved=settings", fd);
}

export async function archivePackageAction(fd: FormData) {
  await requireGrant("manageForms");
  const id = pkgId(fd);
  await setArchived(id, fd.get("archive") === "1");
  revalidatePath("/admin/packages");
  redirect("/admin/packages");
}

export async function documentAction(fd: FormData) {
  await requireGrant("manageForms");
  const id = pkgId(fd);
  const intent = String(fd.get("intent") ?? "");
  const item = String(fd.get("itemId") ?? "");
  if (intent === "add") {
    const t = String(fd.get("templateId") ?? "");
    if (UUID.test(t)) await addDocument(id, t);
  } else if (UUID.test(item)) {
    if (intent === "remove") await removeDocument(id, item);
    else if (intent === "up") await moveDocument(id, item, -1);
    else if (intent === "down") await moveDocument(id, item, 1);
    else if (intent === "optional") await setDocumentRequired(id, item, false);
    else if (intent === "required") await setDocumentRequired(id, item, true);
  }
  revalidatePath(`/admin/packages/${id}`);
  revalidatePath("/admin/forms", "layout");
  back(id, "", fd);
}

export async function stepAction(fd: FormData) {
  await requireGrant("manageForms");
  const id = pkgId(fd);
  const data = await getPackage(id);
  if (!data) redirect("/admin/packages");
  const steps = [...data.pkg.workflow.steps];
  const intent = String(fd.get("intent") ?? "");
  const index = Number(fd.get("index"));

  if (intent === "add") {
    const next = steps.reduce((m, s) => Math.max(m, s.order), 0) + 1;
    steps.push({ order: next, role: "employee", action: "fill_and_sign" });
  } else if (Number.isInteger(index) && index >= 0 && index < steps.length) {
    if (intent === "delete") steps.splice(index, 1);
    else if (intent === "save") steps[index] = parseStepForm(fd);
  }
  const errors = intent === "save" ? validateWorkflow({ steps: [steps[index]!] }) : [];
  if (errors.length) back(id, `?stepError=${encodeURIComponent(errors.join(" · "))}`, fd);
  await setWorkflow(id, { steps });
  revalidatePath(`/admin/packages/${id}`);
  revalidatePath("/admin/forms", "layout");
  back(id, "?saved=1", fd);
}

export type SaveStepsResult = { ok: true } | { ok: false; errors: string[] };

/** The steps editor ("שלבי הטופס") saves all steps at once and stays on the page (no redirect), showing the result. */
export async function saveStepsAction(packageId: string, drafts: StepDraft[]): Promise<SaveStepsResult> {
  await requireGrant("manageForms");
  if (!/^[0-9a-f-]{36}$/i.test(packageId) || !Array.isArray(drafts) || drafts.length > 30) return { ok: false, errors: ["קלט לא תקין"] };
  const data = await getPackage(packageId);
  if (!data) return { ok: false, errors: ["הטופס לא נמצא"] };
  const clean = assignRoles(drafts.map(sanitizeDraft));
  // The same checks the editor shows, on the saved form: the email field of a "by field" step must exist and be
  // filled in an earlier step.
  const defs = await Promise.all(data.items.map((i) => getEditorData(i.templateId)));
  const emailFields = defs.flatMap((e) => (e?.version ? emailFieldsOf(e.version.definition) : []));
  const problems = draftProblems(clean, emailFields).flatMap((list, i) => list.map((m) => `שלב ${i + 1}: ${m}`));
  if (problems.length) return { ok: false, errors: problems };
  const steps = clean.map((d, i) => stepFromDraft(d, i));
  const errors = validateWorkflow({ steps });
  if (errors.length) return { ok: false, errors };
  await setWorkflow(packageId, { steps });
  revalidatePath(`/admin/packages/${packageId}`);
  revalidatePath("/admin/forms", "layout");
  return { ok: true };
}

/**
 * An organization's own route (its steps and people), or `null` to drop it so the organization follows the general
 * route again. Same checks as the general route.
 */
export async function saveOrgRouteAction(packageId: string, organizationId: string, drafts: StepDraft[] | null): Promise<SaveStepsResult> {
  await requireGrant("manageForms");
  if (!UUID.test(packageId) || !UUID.test(organizationId) || (drafts !== null && (!Array.isArray(drafts) || drafts.length > 30))) return { ok: false, errors: ["קלט לא תקין"] };
  const data = await getPackage(packageId);
  if (!data) return { ok: false, errors: ["הטופס לא נמצא"] };
  const routes = { ...(data.pkg.orgWorkflows ?? {}) };
  if (drafts === null) {
    delete routes[organizationId];
  } else {
    // Steps keep the roles they had (copied from another route: the same fields); a new step gets a role of its own.
    const general = data.pkg.workflow.steps.map((s) => s.role);
    const clean = assignRoles(drafts.map(sanitizeDraft), general.filter((r) => !drafts.some((d) => d.role === r)));
    const defs = await Promise.all(data.items.map((i) => getEditorData(i.templateId)));
    const emailFields = defs.flatMap((e) => (e?.version ? emailFieldsOf(e.version.definition) : []));
    const problems = draftProblems(clean, emailFields).flatMap((list, i) => list.map((m) => `שלב ${i + 1}: ${m}`));
    if (problems.length) return { ok: false, errors: problems };
    const steps = clean.map((d, i) => stepFromDraft(d, i));
    const errors = validateWorkflow({ steps });
    if (errors.length) return { ok: false, errors };
    routes[organizationId] = { steps };
  }
  await setOrgWorkflows(packageId, routes);
  revalidatePath(`/admin/packages/${packageId}`);
  revalidatePath("/admin/forms", "layout");
  return { ok: true };
}

/**
 * "עיבוד טופס": the whole tab in one save. The completion destination is split back out to
 * `completionRecipients`, so editing it here is the same as editing it in the send settings.
 */
export async function saveProcessingAction(packageId: string, view: unknown): Promise<SaveStepsResult> {
  await requireGrant("manageForms");
  if (!UUID.test(packageId)) return { ok: false, errors: ["קלט לא תקין"] };
  const data = await getPackage(packageId);
  if (!data) return { ok: false, errors: ["הטופס לא נמצא"] };
  const { processing, completionRecipients } = splitProcessing(normalizeProcessing(view, true));
  if (processing.parts.length > 30 || processing.destinations.length > 30) return { ok: false, errors: ["יותר מדי חלקים או יעדים"] };
  await setProcessing(packageId, processing, completionRecipients);
  revalidatePath(`/admin/packages/${packageId}`);
  revalidatePath("/admin/forms", "layout");
  return { ok: true };
}
