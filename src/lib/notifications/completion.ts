/**
 * Completion e-mail with the signed PDFs to the package's fixed recipients (payroll, HR…). Pure, unit tested.
 * Whoever already gets the ordinary "completed" notice (the person, the opener) is not mailed twice.
 */
import { DEFAULT_TEMPLATES, renderTemplate, type MessageTemplate } from "./templates";

export const COMPLETION_DOCS_KEY = "completion_docs";
/** Resend accepts up to 40MB; keep well under it. Larger sets go as a note to download from the system. */
export const MAX_ATTACH_BYTES = 10 * 1024 * 1024;

export function completionTargets(recipients: { name: string; email: string }[] | null | undefined, alreadyNotified: (string | null | undefined)[]): { name: string; email: string }[] {
  const skip = new Set(alreadyNotified.filter(Boolean).map((e) => e!.toLowerCase()));
  const out: { name: string; email: string }[] = [];
  for (const r of recipients ?? []) {
    const e = r.email?.trim().toLowerCase();
    if (!e || skip.has(e) || out.some((x) => x.email === e)) continue;
    out.push({ name: r.name || e, email: e });
  }
  return out;
}

export function completionMessage(v: { name: string; subject: string; packageName: string; org: string; link: string }, template: MessageTemplate = DEFAULT_TEMPLATES[COMPLETION_DOCS_KEY]!): MessageTemplate {
  const vars = { name: v.name, subject: v.subject, form: v.packageName, org: v.org, link: v.link };
  return { subject: renderTemplate(template.subject, vars), body: renderTemplate(template.body, vars) };
}

/** Which files fit in one e-mail (in order); the rest are left out and the caller notes it in the body. */
export function pickAttachments<T extends { size: number }>(files: T[], max = MAX_ATTACH_BYTES): { attached: T[]; skipped: number } {
  const attached: T[] = [];
  let total = 0;
  let skipped = 0;
  for (const f of files) {
    if (total + f.size > max) { skipped++; continue; }
    attached.push(f);
    total += f.size;
  }
  return { attached, skipped };
}
