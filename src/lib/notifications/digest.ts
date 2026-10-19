/**
 * Weekly "waiting" summary per organization (Sunday 08:00 Israel time): every open request waiting more than 3 days,
 * longest first, to the organization's tracking users and admins. Status only – no form content. Pure, unit tested.
 */
import { israelClock } from "@/lib/workflow/reminders";

export const DIGEST_KEY = "weekly_digest";
export const DIGEST_MIN_DAYS = 3;

export interface DigestItem { subject: string; packageName: string; waitingFor: string; days: number }

/** Sunday, 08:00–08:59 Israel time. */
export const isDigestTime = (now: Date) => {
  const c = israelClock(now);
  return c.weekday === 0 && c.hour === 8;
};

export function digestItems(items: DigestItem[], minDays = DIGEST_MIN_DAYS): DigestItem[] {
  return items.filter((i) => i.days > minDays).sort((a, b) => b.days - a.days);
}

export function digestMessage(org: string, items: DigestItem[], link: string): { subject: string; body: string } {
  const lines = items.slice(0, 60).map((i) => `• ${i.subject} – ${i.packageName} – ממתין ל${i.waitingFor} – ${i.days} ימים`);
  const more = items.length > 60 ? `\nועוד ${items.length - 60} בקשות.` : "";
  return {
    subject: `${items.length} בקשות ממתינות – ${org}`,
    body: `שלום,\nאלה הבקשות של ${org} שממתינות יותר מ-${DIGEST_MIN_DAYS} ימים:\n${lines.join("\n")}${more}\nלמסך המעקב: ${link}`,
  };
}
