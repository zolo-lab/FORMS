import { describe, expect, it } from "vitest";
import { completionMessage, completionTargets, pickAttachments, uploadedFiles } from "@/lib/notifications/completion";

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

describe("files the signers attached go with the completion e-mail", () => {
  it("finds uploads anywhere in the answers, once each", () => {
    const id = "b1e77be6-0087-4da5-9d9f-f8ec2cf006ed";
    const id2 = "745b5162-45e1-4a5e-aedf-2b72040f539f";
    const answers = {
      id_file: { url: `/api/admin/files/${id}`, name: "front.png", size: 1, mime: "image/png" },
      more: [{ url: `/api/admin/files/${id2}`, name: "back.png", size: 1, mime: "image/png" }],
      table: [{ doc: { url: `/api/admin/files/${id}`, name: "front.png" } }],
      sig: { kind: "drawn", image: "data:image/png;base64,xx" },
      name: "ישראל",
    };
    expect(uploadedFiles(answers)).toEqual([{ fileId: id, name: "front.png" }, { fileId: id2, name: "back.png" }]);
  });
});
