"use server";
import { revalidatePath } from "next/cache";
import type { Answers } from "@/lib/forms/conditions";
import { validateAnswers, type FieldErrors } from "@/lib/forms/validate";
import { renderDefault } from "@/lib/notifications/templates";
import { normalizeIsraeliPhone } from "@/lib/whatsapp";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { listPackagesForWizard } from "@/server/packages-store";
import { appUrl, createRequest, getRequest, issueLink, listOrganizations, sendRequest } from "@/server/requests-store";

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

  const [packages, orgs] = await Promise.all([listPackagesForWizard(), listOrganizations()]);
  const pkg = packages.find((p) => p.id === input.packageId);
  const org = orgs.find((o) => o.id === input.organizationId);
  if (!pkg) errors["packageId"] = "ערכה לא נמצאה";
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
