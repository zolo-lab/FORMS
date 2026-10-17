import { normalizeIsraeliPhone } from "@/lib/whatsapp";

export interface DeliveryTarget {
  channel: "email" | "sms";
  to: string;
}

/** Everywhere a person can be reached: the e-mail when known, and an SMS (international digits, 972…) when the phone is valid. */
export function deliveryTargets(p: { email?: string | null; phone?: string | null }): DeliveryTarget[] {
  const out: DeliveryTarget[] = [];
  const email = p.email?.trim();
  if (email) out.push({ channel: "email", to: email });
  const sms = p.phone ? normalizeIsraeliPhone(p.phone) : null;
  if (sms) out.push({ channel: "sms", to: sms });
  return out;
}
