"use server";
import { routeFor } from "@/lib/workflow/assignee";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Answers } from "@/lib/forms/conditions";
import { validateAnswers, type FieldErrors } from "@/lib/forms/validate";
import { withOrgOptions } from "@/lib/forms/linked";
import { listLookupsFor, orgListFields } from "@/server/lists-store";
import { renderDefault } from "@/lib/notifications/templates";
import { normalizeIsraeliPhone } from "@/lib/whatsapp";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { getWizardPackage } from "@/server/packages-store";
import { can, hasGrant, orgAllowed } from "@/lib/auth/permissions";
import { checkChain } from "@/lib/workflow/chain";
import type { Workflow } from "@/lib/workflow/types";
import { canSeeRequest, currentUser, viewer } from "@/server/users-store";
import { mayGrant, requireGrant, requireRequest } from "@/server/guards";
import { listProjects } from "@/server/orgs-store";
import { appUrl, applyStepAction, cancelRequest, changeAssignee, deleteRequest, createRequest, extendExpiry, getRequest, issueLink, listOrganizations, sendRequest } from "@/server/requests-store";

export interface ShareLink {
  stepId: string;
  roleLabel: string;
  who: string;
  url: string;
  /** Ready-to-send invitation text (WhatsApp / copy). */
  message: string;
  phone?: string;
}

export type CreateResult =
  | { ok: true; requestId: string; sent: boolean; links: ShareLink[] }
  | { ok: false; errors: FieldErrors };

export interface CreateInput {
  packageId: string;
  organizationId: string;
  /** Optional project of that organization. */
  projectId?: string;
  subject: { name: string; idNumber?: string; email?: string; phone?: string };
  requesterAnswers: Answers;
  /** An edited approval chain for this request only (needs the "edit chain" permission). */
  workflow?: Workflow;
  send: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createRequestAction(input: CreateInput): Promise<CreateResult> {
  const errors: FieldErrors = {};
  const name = input.subject.name.trim();
  const email = input.subject.email?.trim() || undefined;
  const phone = input.subject.phone?.trim() || undefined;
  if (!name) errors["subject.name"] = "שדה חובה";
  if (email && !EMAIL.test(email)) errors["subject.email"] = "כתובת מייל לא תקינה";
  if (phone && !normalizeIsraeliPhone(phone)) errors["subject.phone"] = "מספר טלפון לא תקין";
  if (input.send && !email && !phone) errors["subject.email"] = "נדרש מייל או טלפון כדי לשלוח לעובד";

  // Only the chosen package (listing every package to find one was slow).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const [pkg, orgs] = await Promise.all([UUID.test(input.packageId) ? getWizardPackage(input.packageId) : null, listOrganizations({ activeOnly: true })]);
  const org = orgs.find((o) => o.id === input.organizationId);
  if (!pkg) errors["packageId"] = "הטופס לא נמצא";
  const { user, perms, access } = await viewer();
  if (pkg && !can(user, perms, pkg.id, "open")) errors["packageId"] = "אין לך הרשאה לפתוח בקשות מהטופס הזה";
  if (!org) errors["organizationId"] = "ארגון לא נמצא";
  else if (!orgAllowed(user, access, org.id)) errors["organizationId"] = "אין לך הרשאה לעמותה / לעסק הזה";
  let projectId: string | undefined;
  if (input.projectId && org) {
    const project = UUID.test(input.projectId) ? (await listProjects()).find((p) => p.id === input.projectId) : undefined;
    if (!project || project.organizationId !== org.id || !project.active) errors["projectId"] = "הפרויקט לא נמצא בעמותה הזו";
    else projectId = project.id;
  }
  // A manager limited to some projects of this organization must pick one of them.
  if (org && !errors["organizationId"] && !orgAllowed(user, access, org.id, projectId)) errors["projectId"] = "יש לבחור פרויקט שמותר לך לעבוד איתו";

  // Server-side validation; only the cleaned answers are stored.
  let cleaned: Answers = {};
  if (pkg) {
    // A choice linked to the organizations' list accepts only the chosen organization's options.
    const v = validateAnswers(withOrgOptions(pkg.requesterDefinition, org?.fieldValues, await orgListFields()), input.requesterAnswers, { lookups: await listLookupsFor([pkg.requesterDefinition]) });
    if (!v.ok) Object.assign(errors, v.errors);
    cleaned = v.cleaned;
  }
  // An edited chain: only with the permission, and only a valid one.
  let workflowOverride: Workflow | null = null;
  if (pkg && input.workflow) {
    if (!can(user, perms, pkg.id, "edit_chain")) errors["workflow"] = "אין לך הרשאה לשנות את שרשרת האישורים";
    else {
      const chain = checkChain(routeFor(pkg, input.organizationId, input.projectId), input.workflow);
      if (!chain.ok) errors["workflow"] = chain.errors[0] ?? "שרשרת לא תקינה";
      else workflowOverride = chain.workflow;
    }
  }
  if (Object.keys(errors).length || !pkg || !org) return { ok: false, errors };

  const requestId = await createRequest({
    packageTemplateId: pkg.id,
    organizationId: org.id,
    projectId,
    subject: { name, idNumber: input.subject.idNumber?.trim() || undefined, email, phone },
    requesterAnswers: cleaned,
    createdBy: user?.id,
    workflowOverride,
  });
  if (!input.send) return { ok: true, requestId, sent: false, links: [] };
  const sent = await sendRequest(requestId);
  revalidatePath("/admin/requests");
  // Reuse the tokens that were just emailed; issuing new ones would invalidate the emailed links.
  return { ok: true, requestId, sent: true, links: await linksFor(requestId, sent.tokens) };
}

/**
 * Link + ready text for every open step that goes to an outside person. Uses `known` tokens when given;
 * otherwise issues a fresh link per step (which revokes the previous one, including an emailed one).
 */
export async function linksFor(requestId: string, known?: { stepId: string; token: string }[]): Promise<ShareLink[]> {
  if (!(await canSeeRequest(requestId))) return [];
  const data = await getRequest(requestId);
  if (!data) return [];
  const [org] = (await listOrganizations()).filter((o) => o.id === data.request.organizationId);
  const out: ShareLink[] = [];
  for (const s of data.steps) {
    if ((s.status !== "active" && s.status !== "in_progress") || s.role === "requester") continue;
    const k = known?.find((t) => t.stepId === s.id);
    const link = k ? { url: `${appUrl()}/s/${k.token}` } : await issueLink(s.id);
    if (!link) continue;
    const isEmployee = s.role === "employee";
    const who = isEmployee ? data.request.subjectName : (s.assigneeName ?? ROLE_LABELS[s.role as StepRole]);
    const message = renderDefault("step_invite", {
      name: who,
      org: org?.name ?? "",
      link: link.url,
      dueDate: data.request.expiresAt ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem" }).format(data.request.expiresAt) : "",
    }).body;
    out.push({ stepId: s.id, roleLabel: ROLE_LABELS[s.role as StepRole], who, url: link.url, message, phone: (isEmployee ? data.request.subjectPhone : s.assigneePhone) ?? undefined });
  }
  return out;
}

export async function refreshLinksAction(requestId: string): Promise<ShareLink[]> {
  return linksFor(requestId);
}

/** Generates (or re-generates when missing) the final PDFs of a completed request. */
export async function finalizeRequestAction(requestId: string): Promise<{ ok: boolean; message: string }> {
  if (!(await canSeeRequest(requestId))) return { ok: false, message: "אין הרשאה" };
  try {
    const { finalizeRequest } = await import("@/server/finalize");
    const r = await finalizeRequest(requestId);
    // Run the destinations here too, so a request finalized by hand is also filed and sent.
    const { runProcessing } = await import("@/server/deliver");
    const p = await runProcessing(requestId);
    revalidatePath(`/admin/requests/${requestId}`);
    const sent = p.run ? `, ${p.run} יעדים בוצעו${p.failed ? ` (${p.failed} נכשלו)` : ""}` : "";
    return { ok: true, message: (r.generated ? `נוצרו ${r.generated} קבצים` : "כל הקבצים כבר קיימים") + sent };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "היצירה נכשלה" };
  }
}

type ActionResult = { ok: boolean; message: string };

async function run(requestId: string, ok: string, fn: () => Promise<unknown>): Promise<ActionResult> {
  if (!(await canSeeRequest(requestId))) return { ok: false, message: "אין הרשאה לבקשה הזו" };
  try {
    await fn();
    revalidatePath(`/admin/requests/${requestId}`);
    revalidatePath("/admin/requests");
    return { ok: true, message: ok };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "הפעולה נכשלה" };
  }
}

export async function cancelRequestAction(requestId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, message: "נדרשת סיבה" };
  if (!(await mayGrant("cancel"))) return { ok: false, message: "אין לך הרשאה לבטל בקשות" };
  return run(requestId, "הבקשה בוטלה", () => cancelRequest(requestId, reason.trim()));
}

export async function extendExpiryAction(requestId: string, days: number): Promise<ActionResult> {
  return run(requestId, `התוקף הוארך ב-${days} ימים`, () => extendExpiry(requestId, days));
}

export async function changeAssigneeAction(requestId: string, stepId: string, assignee: { name?: string; email?: string; phone?: string }): Promise<ActionResult> {
  const email = assignee.email?.trim() || undefined;
  const phone = assignee.phone?.trim() || undefined;
  if (email && !EMAIL.test(email)) return { ok: false, message: "כתובת מייל לא תקינה" };
  if (phone && !normalizeIsraeliPhone(phone)) return { ok: false, message: "מספר טלפון לא תקין" };
  if (!assignee.name?.trim() && !email && !phone) return { ok: false, message: "נדרש שם, מייל או טלפון" };
  // The step must belong to this request (the visibility check in `run` is per request).
  if (!(await getRequest(requestId))?.steps.some((s) => s.id === stepId)) return { ok: false, message: "השלב לא נמצא בבקשה" };
  return run(requestId, "הנמען הוחלף. צרו קישור חדש לשיתוף.", () => changeAssignee(stepId, { name: assignee.name?.trim() || undefined, email, phone }));
}

/** The admin moves the request on without the waiting step (it is marked skipped; the next step gets its link). */
export async function skipStepAction(requestId: string, stepId: string, reason: string): Promise<ActionResult> {
  const step = (await getRequest(requestId))?.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, message: "השלב לא נמצא בבקשה" };
  if (step.status !== "active" && step.status !== "in_progress") return { ok: false, message: "השלב כבר לא ממתין" };
  return run(requestId, "השלב דולג והבקשה עברה לשלב הבא", () => applyStepAction(stepId, { type: "skip", reason }, { type: "user" }));
}

/** The admin sends the request back to an earlier step that was already done (it gets a fresh link). */
export async function returnStepAction(requestId: string, fromStepId: string, toStepId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, message: "נדרשת סיבה" };
  const steps = (await getRequest(requestId))?.steps ?? [];
  const from = steps.find((s) => s.id === fromStepId);
  const to = steps.find((s) => s.id === toStepId);
  if (!from || !to) return { ok: false, message: "השלב לא נמצא בבקשה" };
  if (to.status !== "completed" || to.order >= from.order) return { ok: false, message: "אפשר להחזיר רק לשלב קודם שכבר הושלם" };
  return run(requestId, "הבקשה הוחזרה לשלב הקודם", () => applyStepAction(fromStepId, { type: "return", toStepId, reason: reason.trim() }, { type: "user" }));
}

/** The step now waiting (the first open one that is not the sender's own). */
async function waitingStep(requestId: string) {
  const data = await getRequest(requestId);
  const steps = [...(data?.steps ?? [])].sort((a, b) => a.order - b.order);
  const open = steps.filter((s) => s.status === "active" || s.status === "in_progress");
  return { steps, current: open.find((s) => s.role !== "requester") ?? open[0] };
}

/** From the table: send the request one step back (to the last step that was done before the waiting one), to fix something. */
export async function returnOneStepAction(requestId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, message: "נדרשת סיבה" };
  const { steps, current } = await waitingStep(requestId);
  if (!current) return { ok: false, message: "הבקשה לא ממתינה לאף שלב" };
  const back = steps.filter((s) => s.status === "completed" && s.order < current.order).at(-1);
  if (!back) return { ok: false, message: "אין שלב קודם להחזיר אליו" };
  return run(requestId, "הבקשה הוחזרה שלב אחד אחורה", () => applyStepAction(current.id, { type: "return", toStepId: back.id, reason: reason.trim() }, { type: "user" }));
}

/** From the table: the admin declines the request (it stops; nobody else is asked). */
export async function declineRequestAction(requestId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, message: "נדרשת סיבה" };
  if (!(await mayGrant("cancel"))) return { ok: false, message: "אין לך הרשאה לדחות בקשות" };
  const { current } = await waitingStep(requestId);
  if (!current) return { ok: false, message: "הבקשה לא ממתינה לאף שלב" };
  return run(requestId, "הבקשה נדחתה", () => applyStepAction(current.id, { type: "decline", reason: reason.trim() }, { type: "user" }));
}

/** From the table: delete the request for good. */
export async function deleteRequestAction(requestId: string): Promise<ActionResult> {
  if (!(await mayGrant("cancel"))) return { ok: false, message: "אין לך הרשאה למחוק בקשות" };
  return run(requestId, "הבקשה נמחקה", () => deleteRequest(requestId));
}

/** Cancel several requests at once from the dashboard. Requests that are already finished are skipped. */
export async function bulkCancelAction(formData: FormData) {
  await requireGrant("cancel");
  const reason = String(formData.get("reason") ?? "").trim() || "בוטל בפעולה מרוכזת";
  const ids = formData.getAll("id").map(String).filter((i) => /^[0-9a-f-]{36}$/i.test(i));
  let cancelled = 0;
  let skipped = 0;
  for (const id of ids) {
    if (!(await canSeeRequest(id))) {
      skipped++;
      continue;
    }
    try {
      await cancelRequest(id, reason);
      cancelled++;
    } catch {
      // Already completed/cancelled/expired: left untouched.
      skipped++;
    }
  }
  revalidatePath("/admin/requests");
  redirect(`/admin/requests?cancelled=${cancelled}&skipped=${skipped}`);
}

/** A request saved as draft: send it now. */
export async function sendDraftAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await requireRequest(id);
  try {
    await sendRequest(id);
  } catch {
    redirect(`/admin/requests/${id}?error=send`);
  }
  revalidatePath(`/admin/requests/${id}`);
  revalidatePath("/admin/requests");
  redirect(`/admin/requests/${id}`);
}

/** Discard a draft that was never sent. */
export async function discardDraftAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await requireRequest(id);
  try {
    await cancelRequest(id, "טיוטה נמחקה");
  } catch {
    redirect(`/admin/requests/${id}?error=discard`);
  }
  revalidatePath("/admin/requests");
  redirect("/admin/requests");
}

/** Tick / untick a handling step after signing ("עודכן בשכר"). */
export async function followUpAction(fd: FormData) {
  const requestId = String(fd.get("requestId") ?? "");
  await requireRequest(requestId);
  const me = await currentUser();
  if (!hasGrant(me, "followUp")) redirect(`/admin/requests/${requestId}?error=followup`);
  const { markFollowUp } = await import("@/server/follow-up-store");
  await markFollowUp(requestId, String(fd.get("key") ?? ""), fd.get("done") === "1", { id: me?.id, name: me?.name ?? "מנהל" });
  revalidatePath(`/admin/requests/${requestId}`);
  redirect(`/admin/requests/${requestId}`);
}

/** "נסה שוב" on one destination of "עיבוד טופס": runs that destination again for the current round. */
export async function retryDeliveryAction(requestId: string, destinationId: string): Promise<{ ok: boolean; message: string }> {
  if (!(await canSeeRequest(requestId))) return { ok: false, message: "אין הרשאה" };
  try {
    const { runProcessing } = await import("@/server/deliver");
    const r = await runProcessing(requestId, { only: [destinationId] });
    revalidatePath(`/admin/requests/${requestId}`);
    return r.failed > 0 ? { ok: false, message: "השליחה נכשלה שוב" } : { ok: true, message: "נשלח" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "השליחה נכשלה" };
  }
}
