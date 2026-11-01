import { describe, expect, it } from "vitest";
import { DEFAULT_HTML, designedHtml, htmlToText, looksLikeHtml, renderHtml } from "@/lib/notifications/email-design";
import { effectiveTemplate, renderMessage, TRIGGERS } from "@/lib/notifications/triggers";

describe("designed e-mails", () => {
  it("every trigger except the sign-in code has a design, RTL, with the organization in the header", () => {
    for (const t of TRIGGERS.filter((x) => !x.locked)) {
      const h = DEFAULT_HTML[t.key]!;
      expect(h, t.key).toContain('dir="rtl"');
      expect(h, t.key).toContain("{{org}}");
      expect(h, t.key).toContain("הודעה אוטומטית");
      // A button only where the trigger has a link to give.
      expect(h.includes('href="{{link}}"'), t.key).toBe(t.vars.includes("link"));
    }
  });

  it("escapes the values and keeps their line breaks", () => {
    const out = renderHtml("<p>{{name}}</p><div>{{items}}</div>", { name: '<b>דנה</b> & "בן"', items: "• א\n• ב" });
    expect(out).toBe("<p>&lt;b&gt;דנה&lt;/b&gt; &amp; &quot;בן&quot;</p><div>• א<br>• ב</div>");
  });

  it("the plain-text part keeps every line and the link's address", () => {
    const h = renderHtml(designedHtml({ title: "כותרת", lines: ["שלום {{name}},", "שורה"], button: "למילוי", after: ["עד {{dueDate}}."] }), { name: "דנה", org: "פנימה", link: "https://x.co/s/a?b=1&c=2", dueDate: "1.12" });
    const t = htmlToText(h);
    expect(t.split("\n").slice(0, 4)).toEqual(["כותרת", "פנימה", "שלום דנה,", "שורה"]);
    expect(t).toContain("למילוי: https://x.co/s/a?b=1&c=2");
    expect(t).toContain("עד 1.12.");
    expect(t).toContain("הודעה אוטומטית – נא לא להשיב למייל זה.");
  });

  it("a text saved in the panel is HTML when it has tags, plain text otherwise", () => {
    expect(looksLikeHtml("<p>שלום</p>")).toBe(true);
    expect(looksLikeHtml("שלום {{name}}\n<3")).toBe(false);
    const own = effectiveTemplate("reminder", [{ organizationId: null, key: "reminder", subject: "ת", body: "<p>שלום {{name}}</p>" }], null);
    const m = renderMessage(own, { name: "דנה" });
    expect(m.html).toBe("<p>שלום דנה</p>");
    expect(m.text).toBe("שלום דנה");
    expect(m.body).toContain("עדיין ממתינים לך"); // SMS keeps the plain default
    const plain = renderMessage(effectiveTemplate("reminder", [{ organizationId: null, key: "reminder", subject: "ת", body: "שלום {{name}}" }], null), { name: "דנה" });
    expect(plain).toMatchObject({ html: null, text: "שלום דנה" });
  });
});
