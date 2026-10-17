/** Pure message-template helpers (no I/O). DB overrides live in `message_templates`; these are the defaults. */

export const MAX_ATTEMPTS = 3;

export type TemplateVars = Partial<Record<"name" | "link" | "org" | "dueDate" | "code" | "reason" | "subject" | "stepName", string>>;

export interface MessageTemplate {
  subject: string;
  body: string;
}

/** Single-pass replacement, so values are never re-expanded as placeholders. Unknown variables become "". */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => (vars as Record<string, string | undefined>)[key] ?? "");
}

export const DEFAULT_TEMPLATES: Record<string, MessageTemplate> = {
  step_invite: {
    subject: "מסמכים הממתינים לך – {{org}}",
    body: "שלום {{name}},\nממתינים לך מסמכים למילוי וחתימה ב{{org}}.\nלמעבר למסמכים: {{link}}\nיש להשלים עד {{dueDate}}.",
  },
  reminder: {
    subject: "תזכורת: מסמכים ממתינים לך – {{org}}",
    body: "שלום {{name}},\nעדיין ממתינים לך מסמכים ב{{org}}.\nלמעבר למסמכים: {{link}}\nיש להשלים עד {{dueDate}}.",
  },
  completed: {
    subject: "התהליך הושלם – {{org}}",
    body: "שלום {{name}},\nכל המסמכים נחתמו והתהליך הושלם{{subject}}. תודה!\n{{org}}",
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
