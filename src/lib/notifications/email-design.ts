/**
 * The designed HTML of the e-mails (as the Make e-mails looked: a coloured header with the organization, the text,
 * one button with a backup link, and "הודעה אוטומטית" at the bottom). Every trigger's default HTML is built here with
 * {{variables}} in it; in the panel it can be edited as plain HTML. Pure, unit tested.
 */
import { escapeHtml } from "@/lib/email-html";

export const BRAND = "#1d4f91";

interface Layout {
  /** Big line in the header. */
  title: string;
  /** Paragraphs of the message (may contain {{variables}}). */
  lines: string[];
  /** The button to {{link}}, with this label. */
  button?: string;
  /** Paragraphs after the button. */
  after?: string[];
  /** A boxed block for a list ({{items}}): kept as written, line by line. */
  box?: string;
  /**
   * The details block of the form's fields ({{details}}): a light box above the button, dropped from the e-mail
   * whenever no field marked "show in messages" is filled.
   */
  details?: boolean;
}

const P = (s: string) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.6">${s}</p>`;

/** One e-mail in the shared design, with {{variables}} left in place. */
export function designedHtml(l: Layout): string {
  const button = l.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px"><tr><td style="border-radius:8px;background:${BRAND}"><a href="{{link}}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px">${l.button}</a></td></tr></table>
<p style="margin:0 0 16px;font-size:12px;color:#6b7280">אם הכפתור לא נפתח, אפשר להעתיק את הקישור: <a href="{{link}}" style="color:${BRAND};word-break:break-all">{{link}}</a></p>`
    : "";
  const box = l.box ? `<div style="margin:0 0 16px;padding:12px 16px;background:#f4f5f7;border-radius:8px;font-size:14px;line-height:1.7">${l.box}</div>` : "";
  const details = l.details
    ? optionalBlock("details", `<div style="margin:0 0 16px;padding:12px 16px;background:#f4f5f7;border-right:3px solid ${BRAND};border-radius:8px;font-size:14px;line-height:1.7">{{details}}</div>`)
    : "";
  return `<!doctype html>
<html lang="he" dir="rtl">
<body style="margin:0;padding:24px 12px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden" dir="rtl">
<tr><td style="background:${BRAND};padding:20px 24px;text-align:right;color:#ffffff">
<div style="font-size:22px;font-weight:bold">${l.title}</div>
<div style="font-size:14px;opacity:.9;margin-top:4px">{{org}}</div>
</td></tr>
<tr><td style="padding:24px;text-align:right">
${l.lines.map(P).join("\n")}
${details}${box}${button}${(l.after ?? []).map(P).join("\n")}
</td></tr>
<tr><td style="padding:12px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:right">הודעה אוטומטית – נא לא להשיב למייל זה.</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

/**
 * Wraps a block so it is dropped from the e-mail when its variable is empty. The markers are HTML comments, so a
 * template edited by hand in the panel keeps working either way (an unremoved marker just shows nothing).
 */
export const optionalBlock = (name: string, html: string) => `<!--if:${name}-->${html}<!--/if:${name}-->`;

/** Removes an optional block whose variable is empty, and the markers of the ones that stay. */
export function applyOptionalBlocks(html: string, vars: Record<string, string | undefined>): string {
  return html.replace(/<!--if:(\w+)-->([\s\S]*?)<!--\/if:\1-->/g, (_, name: string, inner: string) => (vars[name]?.trim() ? inner : ""));
}

/** The default design of every trigger. */
export const DEFAULT_HTML: Record<string, string> = {
  sent_to_creator: designedHtml({ title: "נשלח טופס", lines: ["שלום {{name}},", "הטופס \"{{form}}\" של {{subject}} נשלח לדרך.", "ממתין עכשיו ל: {{stepName}}"], button: "למעקב אחרי הבקשה" , details: true }),
  step_invite: designedHtml({ title: "{{form}}", lines: ["שלום {{name}},", "ממתינים לך מסמכים למילוי וחתימה ב{{org}}."], button: "למילוי וחתימה", after: ["יש להשלים עד {{dueDate}}."] , details: true }),
  reminder: designedHtml({ title: "תזכורת: {{form}}", lines: ["שלום {{name}},", "עדיין ממתינים לך מסמכים ב{{org}}."], button: "למילוי וחתימה", after: ["יש להשלים עד {{dueDate}}."] , details: true }),
  returned: designedHtml({ title: "הוחזר לתיקון", lines: ["שלום {{name}},", "המסמכים של \"{{form}}\" הוחזרו לתיקון.", "סיבה: {{reason}}"], button: "לתיקון המסמכים" }),
  step_done: designedHtml({ title: "התקדמות בבקשה", lines: ["שלום {{name}},", "השלב \"{{stepName}}\" בבקשה של {{subject}} הושלם."] }),
  completed: designedHtml({ title: "התהליך הושלם", lines: ["שלום {{name}},", "כל המסמכים נחתמו והתהליך הושלם{{subject}}. תודה!"] , details: true }),
  declined: designedHtml({ title: "הבקשה נדחתה", lines: ["שלום {{name}},", "המסמכים נדחו.", "סיבה: {{reason}}"] }),
  completion_docs: designedHtml({ title: "מסמכים חתומים", lines: ["שלום {{name}},", "כל השלבים ב\"{{form}}\" של {{subject}} הושלמו. המסמכים החתומים מצורפים."], button: "לצפייה בבקשה" , details: true }),
  open_summary: designedHtml({ title: "{{count}} בקשות פתוחות", lines: ["שלום,", "אלה הבקשות של {{org}} שעוד לא הסתיימו:"], box: "{{items}}", button: "למסך המעקב" }),
  weekly_digest: designedHtml({ title: "{{count}} בקשות ממתינות", lines: ["שלום,", "אלה הבקשות של {{org}} שממתינות יותר מ-3 ימים:"], box: "{{items}}", button: "למסך המעקב" }),
};

/**
 * Fills {{variables}} in HTML: values are escaped (a name can't inject markup) and their line breaks become <br>.
 * Unknown variables become "".
 */
export function renderHtml(html: string, vars: Record<string, string | undefined>): string {
  return applyOptionalBlocks(html, vars).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => escapeHtml(vars[key] ?? "").replace(/\r?\n/g, "<br>"));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

/** The plain-text part of an HTML e-mail (and what the mail center shows): blocks become lines, links keep their address. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return !text || text === href ? href : `${text}: ${href}`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Does this stored text look like HTML (an e-mail designed in the panel) rather than plain text? */
export const looksLikeHtml = (s: string) => /<(html|body|table|div|p|br|a|h[1-6]|span|strong|b)\b/i.test(s);
