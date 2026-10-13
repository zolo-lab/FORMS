import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { appendCertificate, certificateRows, type CertificateData } from "@/lib/pdf/certificate";

const data: CertificateData = {
  requestId: "11111111-2222-3333-4444-555555555555",
  organization: "פנימה",
  subject: "דנה כהן",
  documentTitle: "טופס 101",
  documentSha256: "ab".repeat(32),
  generatedAt: new Date("2026-10-13T12:00:00Z"),
  steps: [
    { role: "employee", name: "דנה כהן", status: "completed", completedAt: new Date("2026-10-13T09:30:00Z"), ip: "203.0.113.5" },
    { role: "payroll", name: "חשבות שכר", status: "completed", completedAt: new Date("2026-10-13T10:00:00Z"), ip: null },
  ],
};

describe("certificateRows", () => {
  it("lists the request facts and one row per step, with Jerusalem-time dates", () => {
    const rows = certificateRows(data);
    const text = rows.map((r) => `${r.label}: ${r.value}`).join("\n");
    expect(text).toContain("פנימה");
    expect(text).toContain("דנה כהן");
    expect(text).toContain("טופס 101");
    expect(text).toContain(data.documentSha256);
    // 09:30 UTC is 12:30 in Israel (UTC+3 in October).
    expect(text).toMatch(/13\.10\.2026.*12:30/);
    expect(rows.filter((r) => r.group === "step")).toHaveLength(2);
  });
  it("shows a dash when a step has no completion time or IP", () => {
    const rows = certificateRows({ ...data, steps: [{ role: "approver", name: "x", status: "declined", completedAt: null, ip: null }] });
    expect(rows.find((r) => r.group === "step")!.value).toContain("—");
  });
});

describe("appendCertificate", () => {
  it("adds exactly one page to an existing document and the result reloads", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    await appendCertificate(doc, data);
    expect(doc.getPageCount()).toBe(2);
    const reloaded = await PDFDocument.load(await doc.save());
    expect(reloaded.getPageCount()).toBe(2);
  });
});
