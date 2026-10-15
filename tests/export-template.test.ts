import { describe, expect, it } from "vitest";
import { applyTemplate, cellValue, guessColumns, mappableFields, readTemplate, type ExportTemplate } from "@/lib/export/template";
import type { ExportRequest } from "@/lib/export/rows";
import type { FormDefinition } from "@/lib/forms/schema";

const def: FormDefinition = {
  schemaVersion: 1,
  title: "ספק",
  pages: [
    {
      id: "p1",
      title: "",
      fields: [
        { id: "supplier_name", type: "short_text", label: "שם הספק" },
        { id: "osek", type: "id_number", label: "מספר עוסק", exportKey: "VATNUM" },
        { id: "phone", type: "phone", label: "טלפון" },
        { id: "start", type: "date", label: "תאריך התחלה" },
        { id: "amount", type: "currency", label: "סכום" },
        { id: "kind", type: "radio", label: "סוג ספק", options: [{ value: "lodging", label: "לינה", code: "11" }, { value: "teacher", label: "מנחה" }] },
        { id: "bank", type: "bank_account", label: "חשבון בנק" },
        { id: "sig", type: "signature", label: "חתימה" },
      ],
    },
  ],
};

const req: ExportRequest = {
  id: "r1",
  subjectName: "חוות הגליל",
  subjectIdNumber: "",
  organization: "ארצנו",
  package: "הסכם ספק",
  status: "completed",
  createdAt: new Date("2026-10-15T09:00:00Z"),
  expiresAt: null,
  answers: { supplier_name: "חוות הגליל", osek: "515151515", phone: "050-123-4567", start: "2026-11-01", amount: 12500, kind: "lodging", bank: { bank: "12", branch: "600", account: "123456" } },
  definitions: [def],
};

describe("mappableFields", () => {
  it("lists answer fields and the parts of composite ones, not signatures", () => {
    const keys = mappableFields([def]).map((m) => (m.part ? `${m.key}.${m.part}` : m.key));
    expect(keys).toContain("bank.branch");
    expect(keys).not.toContain("sig");
  });
});

describe("guessColumns", () => {
  it("matches headers by id, export key, label or fixed name", () => {
    const cols = guessColumns(["supplier_name", "VATNUM", "סוג ספק", "ארגון", "עמודה אחרת", ""], [def]);
    expect(cols.map((c) => c.source)).toEqual([
      { kind: "field", key: "supplier_name" },
      { kind: "field", key: "osek" },
      { kind: "field", key: "kind" },
      { kind: "fixed", key: "organization" },
      { kind: "empty" },
      { kind: "empty" },
    ]);
    expect(cols[1]!.format).toBe("digits");
    expect(cols[2]!.format).toBe("code");
  });
});

describe("cellValue", () => {
  const cell = (c: Parameters<typeof cellValue>[0]) => cellValue(c, req);
  it("writes each format", () => {
    expect(cell({ header: "", source: { kind: "field", key: "kind" }, format: "code" })).toBe("11");
    expect(cell({ header: "", source: { kind: "field", key: "kind" } })).toBe("לינה");
    expect(cell({ header: "", source: { kind: "field", key: "phone" }, format: "digits" })).toBe("0501234567");
    expect(cell({ header: "", source: { kind: "field", key: "start" }, format: "date_ddmmyyyy" })).toBe("01/11/2026");
    expect(cell({ header: "", source: { kind: "field", key: "start" }, format: "date_iso" })).toBe("2026-11-01");
    expect(cell({ header: "", source: { kind: "field", key: "amount" }, format: "number" })).toBe("12500");
    expect(cell({ header: "", source: { kind: "field", key: "bank", part: "branch" } })).toBe("600");
    expect(cell({ header: "", source: { kind: "field", key: "VATNUM" } })).toBe("515151515");
    expect(cell({ header: "", source: { kind: "const", value: "Y" } })).toBe("Y");
    expect(cell({ header: "", source: { kind: "fixed", key: "organization" } })).toBe("ארצנו");
    expect(cell({ header: "", source: { kind: "fixed", key: "createdAt" }, format: "date_ddmmyyyy" })).toBe("15/10/2026");
    expect(cell({ header: "", source: { kind: "empty" } })).toBe("");
  });
  it("an option without a code exports its value", () => {
    expect(cellValue({ header: "", source: { kind: "field", key: "kind" }, format: "code" }, { ...req, answers: { kind: "teacher" } })).toBe("teacher");
  });
  it("missing answers are empty, not 'undefined'", () => {
    const empty = { ...req, answers: {} };
    expect(cellValue({ header: "", source: { kind: "field", key: "amount" }, format: "number" }, empty)).toBe("");
    expect(cellValue({ header: "", source: { kind: "field", key: "bank", part: "bank" } }, empty)).toBe("");
    expect(cellValue({ header: "", source: { kind: "field", key: "nope" } }, empty)).toBe("");
  });
});

describe("applyTemplate", () => {
  const t: ExportTemplate = {
    name: "פריוריטי – ספקים",
    columns: [
      { header: "SUPNAME", source: { kind: "field", key: "supplier_name" } },
      { header: "TYPE", source: { kind: "field", key: "kind" }, format: "code" },
      { header: "ACTIVE", source: { kind: "const", value: "Y" } },
    ],
  };
  it("writes the header row then a row per request, in the template's column order", () => {
    expect(applyTemplate(t, [req])).toEqual([["SUPNAME", "TYPE", "ACTIVE"], ["חוות הגליל", "11", "Y"]]);
  });
  it("can leave the header out", () => {
    expect(applyTemplate({ ...t, includeHeader: false }, [req])).toEqual([["חוות הגליל", "11", "Y"]]);
  });
});

describe("readTemplate", () => {
  it("repairs bad stored data", () => {
    const t = readTemplate({ name: "x", columns: [{ header: "A", source: { kind: "weird" } }, { header: "B", source: { kind: "fixed", key: "nope" } }, { header: "C", source: { kind: "field", key: "a" }, format: "bad" }] });
    expect(t.columns.map((c) => c.source.kind)).toEqual(["empty", "empty", "field"]);
    expect(t.columns[2]!.format).toBeUndefined();
    expect(t.includeHeader).toBe(true);
  });
});
