import { describe, expect, it } from "vitest";
import { completionMessage, completionTargets, pickAttachments } from "@/lib/notifications/completion";

describe("completion e-mail", () => {
  it("each fixed recipient once, skipping who already gets the ordinary notice", () => {
    const t = completionTargets(
      [{ name: "חשבות", email: "Payroll@x.org" }, { name: "dup", email: "payroll@x.org" }, { name: "מנהל", email: "boss@x.org" }],
      ["boss@x.org", null],
    );
    expect(t).toEqual([{ name: "חשבות", email: "payroll@x.org" }]);
  });
  it("message names the package and the person", () => {
    const m = completionMessage({ name: "חשבות", subject: "דנה כהן", packageName: "שינוי תנאים", org: "שיבת ציון", link: "https://x/r/1" });
    expect(m.subject).toBe("מסמכים חתומים: שינוי תנאים – דנה כהן");
    expect(m.body).toContain("https://x/r/1");
  });
  it("attachments stay under the limit", () => {
    const r = pickAttachments([{ size: 6 }, { size: 6 }, { size: 3 }], 10);
    expect(r.attached.map((f) => f.size)).toEqual([6, 3]);
    expect(r.skipped).toBe(1);
  });
});
