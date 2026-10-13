/** Validation of POST /api/v1/requests bodies (pure). */
import { normalizeIsraeliPhone } from "@/lib/whatsapp";

export interface CreateBody {
  packageTemplateId: string;
  subject: { name: string; idNumber?: string; email?: string; phone?: string };
  answers: Record<string, unknown>;
  expiresAt?: Date;
  redirectUrl?: string;
  apiParams?: Record<string, unknown>;
  send: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const MAX_PARAMS_JSON = 4096;
const MAX_DAYS = 365;

export function parseCreateBody(raw: unknown, now = new Date()): { ok: true; value: CreateBody } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!isObj(raw)) return { ok: false, errors: { body: "expected a JSON object" } };

  const packageTemplateId = typeof raw.packageTemplateId === "string" ? raw.packageTemplateId : "";
  if (!UUID.test(packageTemplateId)) errors.packageTemplateId = "must be a UUID";

  const s = isObj(raw.subject) ? raw.subject : {};
  const name = typeof s.name === "string" ? s.name.trim() : "";
  if (!name) errors["subject.name"] = "required";
  const email = typeof s.email === "string" && s.email.trim() ? s.email.trim() : undefined;
  if (email && !EMAIL.test(email)) errors["subject.email"] = "invalid email";
  const phone = typeof s.phone === "string" && s.phone.trim() ? s.phone.trim() : undefined;
  if (phone && !normalizeIsraeliPhone(phone)) errors["subject.phone"] = "invalid Israeli phone";
  const idNumber = typeof s.idNumber === "string" && s.idNumber.trim() ? s.idNumber.trim() : undefined;

  let answers: Record<string, unknown> = {};
  if (raw.answers !== undefined) {
    if (isObj(raw.answers)) answers = raw.answers;
    else errors.answers = "must be an object";
  }

  let expiresAt: Date | undefined;
  if (raw.expiresAt !== undefined) {
    const d = typeof raw.expiresAt === "string" ? new Date(raw.expiresAt) : null;
    if (!d || Number.isNaN(d.getTime())) errors.expiresAt = "must be an ISO date-time";
    else if (d.getTime() <= now.getTime()) errors.expiresAt = "must be in the future";
    else if (d.getTime() - now.getTime() > MAX_DAYS * 86_400_000) errors.expiresAt = `at most ${MAX_DAYS} days ahead`;
    else expiresAt = d;
  }

  let redirectUrl: string | undefined;
  if (raw.redirectUrl !== undefined) {
    try {
      const u = new URL(String(raw.redirectUrl));
      if (u.protocol !== "https:") throw new Error("not https");
      redirectUrl = u.toString();
    } catch {
      errors.redirectUrl = "must be an https URL";
    }
  }

  let apiParams: Record<string, unknown> | undefined;
  if (raw.apiParams !== undefined) {
    if (!isObj(raw.apiParams)) errors.apiParams = "must be an object";
    else if (JSON.stringify(raw.apiParams).length > MAX_PARAMS_JSON) errors.apiParams = `at most ${MAX_PARAMS_JSON} characters of JSON`;
    else apiParams = raw.apiParams;
  }

  if (raw.send !== undefined && typeof raw.send !== "boolean") errors.send = "must be true or false";
  const send = raw.send !== false;
  if (send && !email && !phone) errors["subject.email"] = errors["subject.email"] ?? "email or phone required to send";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { packageTemplateId, subject: { name, idNumber, email, phone }, answers, expiresAt, redirectUrl, apiParams, send } };
}
