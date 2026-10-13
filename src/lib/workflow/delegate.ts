import { normalizeIsraeliPhone } from "@/lib/whatsapp";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reason code when the person an approver hands the step to is unusable; null when fine. */
export function delegateError(a: { name: string; email?: string; phone?: string }): "name_required" | "contact_required" | "bad_email" | "bad_phone" | null {
  if (!a.name.trim()) return "name_required";
  if (!a.email?.trim() && !a.phone?.trim()) return "contact_required";
  if (a.email?.trim() && !EMAIL.test(a.email.trim())) return "bad_email";
  if (a.phone?.trim() && !normalizeIsraeliPhone(a.phone)) return "bad_phone";
  return null;
}
