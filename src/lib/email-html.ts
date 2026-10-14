/** Turns a plain-text notification body into a simple RTL HTML email: lines become paragraphs, links become buttons. */
const URL_RE = /https?:\/\/[^\s<>"]+/;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function emailHtml(body: string, senderName = ""): string {
  const parts = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = URL_RE.exec(line);
      if (!m) return `<p style="margin:0 0 12px;line-height:1.6">${escapeHtml(line)}</p>`;
      const url = m[0];
      const label = escapeHtml(line.replace(url, "").replace(/[:：\s]+$/, "").trim());
      const href = escapeHtml(url);
      return (
        (label ? `<p style="margin:0 0 12px;line-height:1.6">${label}</p>` : "") +
        `<p style="margin:0 0 16px"><a href="${href}" style="display:inline-block;background:#1d4f91;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:bold">לפתיחה</a></p>` +
        `<p style="margin:0 0 16px;font-size:12px;color:#6b7280;word-break:break-all">${href}</p>`
      );
    })
    .join("");
  const head = senderName ? `<p style="margin:0 0 16px;font-size:18px;font-weight:bold">${escapeHtml(senderName)}</p>` : "";
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#111827"><div dir="rtl" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;text-align:right">${head}${parts}</div></body></html>`;
}
