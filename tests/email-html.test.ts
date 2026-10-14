import { describe, expect, it } from "vitest";
import { emailHtml } from "@/lib/email-html";

describe("emailHtml", () => {
  it("is RTL and turns a link line into a button", () => {
    const h = emailHtml("שלום דנה,\nלמעבר למסמכים: https://x.co/s/abc\nיש להשלים עד 13.11.2026.", "ארגון");
    expect(h).toContain('dir="rtl"');
    expect(h).toContain('href="https://x.co/s/abc"');
    expect(h).toContain("לפתיחה");
    expect(h).toContain("למעבר למסמכים");
    expect(h).toContain("ארגון");
  });

  it("escapes user text", () => {
    const h = emailHtml('<script>alert(1)</script> & "x"');
    expect(h).not.toContain("<script>");
    expect(h).toContain("&lt;script&gt;");
  });
});
