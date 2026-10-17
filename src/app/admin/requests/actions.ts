"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Answers } from "@/lib/forms/conditions";
import { validateAnswers, type FieldErrors } from "@/lib/forms/validate";
import { renderDefault } from "@/lib/notifications/templates";
import { normalizeIsraeliPhone } from "@/lib/whatsapp";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { getWizardPackage } from "@/server/packages-store";
import { can } from "@/lib/auth/permissions";
import { viewer } from "@/server/users-store";
import { appUrl, cancelRequest, changeAssignee, createRequest, extendExpiry, getRequest, issueLink, listOrganizations, sendRequest } from "@/server/requests-store";

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
  subject: { name: string; idNumber?: string; email?: string; phone?: string };
  requesterAnswers: Answers;
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
  const [pkg, orgs] = await Promise.all([UUID.test(input.packageId) ? getWizardPackage(input.packageId) : null, listOrganizations()]);
  const org = orgs.find((o) => o.id === input.organizationId);
  if (!pkg) errors["packageId"] = "ערכה לא נמצאה";
  const { user, perms } = await viewer();
  if (pkg && !can(user, perms, pkg.id, "open")) errors["packageId"] = "אין לך הרשאה לפתוח בקשות מהערכה הזו";
  if (!org) errors["organizationId"] = "ארגון לא נמצא";

  // Server-side validation; only the cleaned answers are stored.
  let cleaned: Answers = {};
  if (pkg) {
    const v = validateAnswers(pkg.requesterDefinition, input.requesterAnswers);
    if (!v.ok) Object.assign(errors, v.errors);
    cleaned = v.cleaned;
  }
  if (Object.keys(errors).length || !pkg || !org) return { ok: false, errors };

  const requestId = await createRequest({
    packageTemplateId: pkg.id,
    organizationId: org.id,
    subject: { name, idNumber: input.subject.idNumber?.trim() || undefined, email, phone },
    requesterAnswers: cleaned,
    createdBy: user?.id,
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
  try {
    const { finalizeRequest } = await import("@/server/finalize");
    const r = await finalizeRequest(requestId);
    revalidatePath(`/admin/requests/${requestId}`);
    return { ok: true, message: r.generated ? `נוצרו ${r.generated} קבצים` : "כל הקבצים כבר קיימים (קבצים שטרם בארכיון ב-Drive הועלו אליו)" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "היצירה נכשלה" };
  }
}

type ActionResult = { ok: boolean; message: string };

async function run(requestId: string, ok: string, fn: () => Promise<unknown>): Promise<ActionResult> {
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
  return run(requestId, "הנמען הוחלף. צרו קישור חדש לשיתוף.", () => changeAssignee(stepId, { name: assignee.name?.trim() || undefined, email, phone }));
}

/** Cancel several requests at once from the dashboard. Requests that are already finished are skipped. */
export async function bulkCancelAction(formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim() || "בוטל בפעולה מרוכזת";
  const ids = formData.getAll("id").map(String).filter((i) => /^[0-9a-f-]{36}$/i.test(i));
  let cancelled = 0;
  let skipped = 0;
  for (const id of ids) {
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
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/admin/requests");
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
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/admin/requests");
  try {
    await cancelRequest(id, "טיוטה נמחקה");
  } catch {
    redirect(`/admin/requests/${id}?error=discard`);
  }
  revalidatePath("/admin/requests");
  redirect("/admin/requests");
}
