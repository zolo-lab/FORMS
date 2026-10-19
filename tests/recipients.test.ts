import { describe, expect, it } from "vitest";
import { formatRecipients, parseRecipients } from "@/lib/requests/recipients";

describe("parseRecipients", () => {
  it("reads names, plain addresses, separators; dedupes; reports bad lines", () => {
    const r = parseRecipients("חשבות שכר <Payroll@misrad.org.il>\nhr@misrad.org.il, payroll@misrad.org.il\nnot-an-email");
    expect(r.valid).toEqual([{ name: "חשבות שכר", email: "payroll@misrad.org.il" }, { name: "hr@misrad.org.il", email: "hr@misrad.org.il" }]);
    expect(r.invalid).toEqual(["not-an-email"]);
  });
  it("formats back", () => {
    expect(formatRecipients([{ name: "חשבות", email: "a@b.co" }, { name: "x@y.co", email: "x@y.co" }])).toBe("חשבות <a@b.co>\nx@y.co");
  });
});
