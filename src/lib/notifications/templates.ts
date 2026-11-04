/** Pure message-template helpers (no I/O). DB overrides live in `message_templates`; these are the defaults. */

export const MAX_ATTEMPTS = 3;

export type TemplateVars = Partial<Record<"name" | "link" | "org" | "dueDate" | "code" | "reason" | "subject" | "stepName" | "form" | "count" | "items" | "details", string>>;

export interface MessageTemplate {
  subject: string;
  body: string;
}

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/** A line that is nothing but placeholders and spaces, e.g. "{{details}}": it disappears when they are all empty. */
const isPlaceholderOnly = (line: string) => line.trim().length > 0 && line.replace(PLACEHOLDER, "").trim() === "";

/**
 * Single-pass replacement, so values are never re-expanded as placeholders. Unknown variables become "".
 * A line made only of placeholders that all came out empty (an optional block such as {{details}}) is dropped,
 * so the message has no blank gap where it would have been.
 */
export function renderTemplate(text: string, vars: TemplateVars): string {
  const fill = (s: string) => s.replace(PLACEHOLDER, (_, key: string) => (vars as Record<string, string | undefined>)[key] ?? "");
  return text
    .split("\n")
    .map((line) => (isPlaceholderOnly(line) ? fill(line).trim() || null : fill(line)))
    .filter((line): line is string => line !== null)
    .join("\n");
}

export const DEFAULT_TEMPLATES: Record<string, MessageTemplate> = {
  sent_to_creator: {
    subject: "נשלח טופס {{form}} ל{{subject}}",
    body: "שלום {{name}},\nהטופס \"{{form}}\" של {{subject}} נשלח לדרך.\n{{details}}\nממתין עכשיו ל: {{stepName}}\nלמעקב אחרי הבקשה: {{link}}\n{{org}}",
  },
  step_invite: {
    subject: "מסמכים הממתינים לך – {{org}}",
    body: "שלום {{name}},\nממתינים לך מסמכים למילוי וחתימה ב{{org}}.\n{{details}}\nלמעבר למסמכים: {{link}}\nיש להשלים עד {{dueDate}}.",
  },
  reminder: {
    subject: "תזכורת: מסמכים ממתינים לך – {{org}}",
    body: "שלום {{name}},\nעדיין ממתינים לך מסמכים ב{{org}}.\n{{details}}\nלמעבר למסמכים: {{link}}\nיש להשלים עד {{dueDate}}.",
  },
  completed: {
    subject: "התהליך הושלם – {{org}}",
    body: "שלום {{name}},\nכל המסמכים נחתמו והתהליך הושלם{{subject}}. תודה!\n{{details}}\n{{org}}",
  },
  declined: {
    subject: "המסמכים נדחו – {{org}}",
    body: "שלום {{name}},\nהמסמכים נדחו. סיבה: {{reason}}\n{{org}}",
  },
  returned: {
    subject: "המסמכים הוחזרו לתיקון – {{org}}",
    body: "שלום {{name}},\nהמסמכים הוחזרו לתיקון. סיבה: {{reason}}\nלמעבר למסמכים: {{link}}",
  },
  step_done: {
    subject: "התקדמות בבקשה – {{subject}}",
    body: "שלום {{name}},\nהשלב \"{{stepName}}\" בבקשה של {{subject}} הושלם.\n{{org}}",
  },
  completion_docs: {
    subject: "מסמכים חתומים: {{form}} – {{subject}}",
    body: "שלום {{name}},\nכל השלבים ב\"{{form}}\" של {{subject}} הושלמו. המסמכים החתומים מצורפים.\n{{details}}\nלצפייה בבקשה: {{link}}\n{{org}}",
  },
  open_summary: {
    subject: "{{count}} בקשות פתוחות – {{org}}",
    body: "שלום,\nאלה הבקשות של {{org}} שעוד לא הסתיימו:\n{{items}}\nלמסך המעקב: {{link}}",
  },
  weekly_digest: {
    subject: "{{count}} בקשות ממתינות – {{org}}",
    body: "שלום,\nאלה הבקשות של {{org}} שממתינות יותר מ-3 ימים:\n{{items}}\nלמסך המעקב: {{link}}",
  },
  otp: {
    subject: "קוד האימות שלך – {{org}}",
    body: "קוד האימות שלך: {{code}}\nהקוד תקף ל-10 דקות. אם לא ביקשת אותו, אפשר להתעלם מההודעה.",
  },
};

export function renderDefault(key: string, vars: TemplateVars): MessageTemplate {
  const t = DEFAULT_TEMPLATES[key];
  if (!t) throw new Error(`unknown message template: ${key}`);
  return { subject: renderTemplate(t.subject, vars), body: renderTemplate(t.body, vars) };
}

/** Outbox state after one delivery attempt: retry until MAX_ATTEMPTS, then `failed`. */
export function afterAttempt(previousAttempts: number, ok: boolean): { status: "sent" | "queued" | "failed"; attempts: number } {
  const attempts = previousAttempts + 1;
  if (ok) return { status: "sent", attempts };
  return { status: attempts >= MAX_ATTEMPTS ? "failed" : "queued", attempts };
}
