import { describe, expect, it } from "vitest";
import { buildExportTable, type ExportRequest } from "@/lib/export/rows";

const base = (over: Partial<ExportRequest>): ExportRequest => ({
  id: "r1", subjectName: "דנה", subjectIdNumber: "123", organization: "א", package: "שינוי תנאים",
  status: "completed", createdAt: new Date("2026-10-01T08:00:00Z"), expiresAt: null, answers: {}, definitions: [],
  ...over,
});

describe("export – campaign and follow-up columns", () => {
  it("adds no trailing columns when nothing is tagged", () => {
    const [head] = buildExportTable([base({})]);
    expect(head).not.toContain("קמפיין");
  });

  it("adds campaign and one date column per handling step", () => {
    const t = buildExportTable([
      base({ campaign: "101 2027", followUp: [{ label: "הוזן לשכר", at: new Date("2026-10-05T10:00:00Z") }, { label: "תויק", at: null }] }),
      base({ id: "r2", followUp: [{ label: "הוזן לשכר", at: null }] }),
    ]);
    const head = t[0]!;
    const c = head.indexOf("קמפיין");
    const f = head.indexOf("הוזן לשכר – תאריך");
    expect(c).toBeGreaterThan(0);
    expect(head).toContain("תויק – תאריך");
    expect(t[1]![c]).toBe("101 2027");
    expect(t[1]![f]).toBe("2026-10-05");
    expect(t[2]![c]).toBe("");
    expect(t[2]![f]).toBe("");
    expect(t.every((row) => row.length === head.length)).toBe(true);
  });
});
