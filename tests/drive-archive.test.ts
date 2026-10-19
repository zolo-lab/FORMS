import { describe, expect, it } from "vitest";
import { archiveFileName, archiveFolders, archiveLayoutFromEnv, archiveTarget, archiveYear, payrollFileName, payrollFolders, safeSegment } from "@/lib/drive/archive-path";

describe("safeSegment", () => {
  it("removes path separators, control and bidi marks", () => {
    expect(safeSegment("a/b\\c:d")).toBe("a b c d");
    expect(safeSegment("‏שלום‎")).toBe("שלום");
    expect(safeSegment("  רב   רווחים ")).toBe("רב רווחים");
  });
  it("never returns an empty name or a hidden dot name", () => {
    expect(safeSegment("")).toBe("ללא שם");
    expect(safeSegment("///", "טופס")).toBe("טופס");
    expect(safeSegment("..hidden")).toBe("hidden");
  });
  it("bounds the length", () => {
    expect(safeSegment("א".repeat(300)).length).toBeLessThanOrEqual(80);
  });
});

describe("archive layout", () => {
  const signedAt = new Date("2026-10-16T09:00:00Z");
  it("files by organization, form type and year", () => {
    expect(archiveFolders({ organization: "שיבת ציון", formTitle: "הסכם ספק", signedAt })).toEqual(["שיבת ציון", "הסכם ספק", "2026"]);
  });
  it("uses the Israel year around New Year", () => {
    expect(archiveYear(new Date("2026-12-31T22:30:00Z"))).toBe("2027");
    expect(archiveYear(new Date("2026-12-31T21:30:00Z"))).toBe("2026");
  });
  it("names the file so it is recognisable outside the system", () => {
    expect(archiveFileName({ formTitle: "הסכם ספק", subject: "חוות הגליל", requestId: "41306ebf-1234-5678-9abc-def012345678", signedAt })).toBe("הסכם ספק – חוות הגליל – 2026-10-16 – 41306ebf.pdf");
  });
  it("copes with a missing subject", () => {
    expect(archiveFileName({ formTitle: "טופס", subject: "", requestId: "abcdef12-0000", signedAt })).toContain("ללא נמען");
  });
});

describe("payroll layout (the folders the payroll team already uses)", () => {
  const signedAt = new Date("2026-10-16T09:00:00Z");
  it("101 forms go to שכר <org>/<year>/101_<year>, the rest to מסמכי עובדים/<form>", () => {
    expect(payrollFolders({ organization: "פנימה", formTitle: "טופס 101", signedAt })).toEqual(["שכר פנימה", "2026", "101_2026"]);
    expect(payrollFolders({ organization: "פנימה", formTitle: "הסכם העסקה", signedAt })).toEqual(["שכר פנימה", "מסמכי עובדים", "הסכם העסקה"]);
    expect(payrollFolders({ organization: "פנימה", formTitle: "טופס 1010", signedAt })).toEqual(["שכר פנימה", "מסמכי עובדים", "טופס 1010"]);
  });
  it("names files <form> - <name> <id>", () => {
    expect(payrollFileName({ formTitle: "הסכם העסקה", subject: "דנה כהן", subjectIdNumber: "012345678", requestId: "x" })).toBe("הסכם העסקה - דנה כהן 012345678.pdf");
    expect(payrollFileName({ formTitle: "הסכם", subject: "דנה", subjectIdNumber: null, requestId: "41306ebf-1234" })).toBe("הסכם - דנה 41306ebf.pdf");
  });
  it("is chosen by GOOGLE_DRIVE_LAYOUT", () => {
    expect(archiveLayoutFromEnv("payroll")).toBe("payroll");
    expect(archiveLayoutFromEnv(undefined)).toBe("simple");
    const i = { organization: "פנימה", formTitle: "טופס 101", subject: "דנה", subjectIdNumber: "1", requestId: "41306ebf-1", signedAt };
    expect(archiveTarget(i, "payroll").folders[2]).toBe("101_2026");
    expect(archiveTarget(i, "simple").folders).toEqual(["פנימה", "טופס 101", "2026"]);
  });
});
