import { describe, expect, it } from "vitest";
import { archiveFileName, archiveFolders, archiveYear, safeSegment } from "@/lib/drive/archive-path";

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
