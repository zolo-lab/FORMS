/** "שם <mail>" / "mail" lines → recipients (pure, unit tested). */
export interface Recipient { name: string; email: string }

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function parseRecipients(text: string): { valid: Recipient[]; invalid: string[] } {
  const valid: Recipient[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.*?)<\s*([^>]+)\s*>$/.exec(line);
    const email = (m ? m[2]! : line).trim().toLowerCase();
    const name = (m ? m[1]! : "").trim().replace(/^"|"$/g, "") || email;
    if (!EMAIL.test(email)) invalid.push(line);
    else if (!valid.some((r) => r.email === email)) valid.push({ name, email });
  }
  return { valid: valid.slice(0, 20), invalid };
}

export const formatRecipients = (list: Recipient[] | null | undefined) =>
  (list ?? []).map((r) => (r.name && r.name !== r.email ? `${r.name} <${r.email}>` : r.email)).join("\n");
