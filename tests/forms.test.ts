import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { evaluateCondition } from "@/lib/forms/conditions";
import { FIELD_TYPES, FIELD_TYPE_META } from "@/lib/forms/field-types";
import { formatAnswer } from "@/lib/forms/format";
import { pdfMappingSchema, resolveStampValue, stampPdf } from "@/lib/forms/pdf-mapping";
import { parseFormDefinition } from "@/lib/forms/schema";
import { validateAnswers } from "@/lib/forms/validate";
import { sampleForm, validAnswers } from "./fixtures/sample-form";

const today = "2026-10-13";

describe("schema", () => {
  it("sample form parses", () => {
    const r = parseFormDefinition(sampleForm);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });
  it("rejects duplicate field ids", () => {
    const bad = structuredClone(sampleForm);
    bad.pages[1]!.fields.push({ id: "firstName", type: "short_text", label: "x" });
    expect(parseFormDefinition(bad).success).toBe(false);
  });
  it("rejects invalid field ids", () => {
    const bad = structuredClone(sampleForm);
    bad.pages[0]!.fields[1]!.id = "שם";
    expect(parseFormDefinition(bad).success).toBe(false);
  });
  it("every field type has Hebrew metadata", () => {
    for (const t of FIELD_TYPES) expect(FIELD_TYPE_META[t].label.length).toBeGreaterThan(0);
  });
  it("covers all Google Forms question types", () => {
    const google = ["short_text", "long_text", "radio", "checkboxes", "dropdown", "file_upload", "linear_scale", "rating", "radio_grid", "checkbox_grid", "date", "time"];
    for (const t of google) expect(FIELD_TYPES).toContain(t);
  });
});

describe("conditions", () => {
  const a = { status: "married", kids: 2, tags: ["a", "b"], empty: "" };
  it.each([
    [{ field: "status", op: "eq", value: "married" }, true],
    [{ field: "status", op: "neq", value: "married" }, false],
    [{ field: "kids", op: "gt", value: 1 }, true],
    [{ field: "kids", op: "lte", value: "1" }, false],
    [{ field: "tags", op: "contains", value: "b" }, true],
    [{ field: "status", op: "in", value: ["single", "married"] }, true],
    [{ field: "empty", op: "empty" }, true],
    [{ field: "missing", op: "notEmpty" }, false],
    [{ all: [{ field: "status", op: "eq", value: "married" }, { field: "kids", op: "gte", value: 2 }] }, true],
    [{ any: [{ field: "status", op: "eq", value: "single" }, { field: "kids", op: "eq", value: 2 }] }, true],
    [{ not: { field: "status", op: "eq", value: "married" } }, false],
  ] as const)("%j → %s", (cond, expected) => {
    expect(evaluateCondition(cond as never, a)).toBe(expected);
  });
});

describe("validateAnswers", () => {
  it("accepts valid answers", () => {
    const r = validateAnswers(sampleForm, validAnswers, { today });
    expect(r.errors).toEqual({});
    expect(r.ok).toBe(true);
  });

  it("reports required fields", () => {
    const r = validateAnswers(sampleForm, {}, { today });
    expect(r.errors.firstName).toBe("שדה חובה");
    expect(r.errors.sig).toBe("נדרשת חתימה");
    expect(r.errors.declare).toBe("יש לאשר כדי להמשיך");
  });

  it("validates Israeli ID and phone", () => {
    const r = validateAnswers(sampleForm, { ...validAnswers, idNumber: "123456789", mobile: "123" }, { today });
    expect(r.errors.idNumber).toBe("מספר תעודת זהות לא תקין");
    expect(r.errors.mobile).toBe("מספר טלפון לא תקין");
  });

  it("requiredIf + visibleIf", () => {
    const married = validateAnswers(sampleForm, { ...validAnswers, maritalStatus: "married" }, { today });
    expect(married.errors.spouseName).toBe("שדה חובה");
    const single = validateAnswers(sampleForm, { ...validAnswers, spouseName: "x" }, { today });
    expect(single.ok).toBe(true);
    expect(single.cleaned.spouseName).toBeUndefined(); // hidden → dropped
  });

  it("repeating table rows are validated with row-scoped errors", () => {
    const r = validateAnswers(
      sampleForm,
      { ...validAnswers, hasChildren: "yes", children: [{ name: "דנה", childId: "000000018", birthDate: "2015-01-01" }, { name: "", childId: "1", birthDate: "x" }] },
      { today },
    );
    expect(r.errors["children.1.name"]).toBe("שדה חובה");
    expect(r.errors["children.1.childId"]).toBe("מספר תעודת זהות לא תקין");
    expect(r.errors["children.1.birthDate"]).toBe("תאריך לא תקין");
    expect(r.errors["children.0.name"]).toBeUndefined();
  });

  it("table minRows", () => {
    const r = validateAnswers(sampleForm, { ...validAnswers, hasChildren: "yes", children: [] }, { today });
    expect(r.errors.children).toBe("נדרשות לפחות 1 שורות");
  });

  it("date maxDate=today", () => {
    const r = validateAnswers(sampleForm, { ...validAnswers, birthDate: "2030-01-01" }, { today });
    expect(r.errors.birthDate).toContain("2026-10-13");
  });

  it("role filter validates only that role's fields", () => {
    const r = validateAnswers(sampleForm, {}, { today, role: "requester" });
    expect(Object.keys(r.errors).sort()).toEqual(["jobPercent", "salary"]);
  });

  it("option values are enforced", () => {
    const r = validateAnswers(sampleForm, { ...validAnswers, incomeTypes: ["hacked"] }, { today });
    expect(r.errors.incomeTypes).toBe("יש לבחור מהאפשרויות");
  });
});

describe("formatAnswer", () => {
  const f = (id: string) => sampleForm.pages.flatMap((p) => p.fields).find((x) => x.id === id)!;
  it("dates", () => expect(formatAnswer(f("birthDate"), "1990-05-01")).toBe("01/05/1990"));
  it("options", () => expect(formatAnswer(f("maritalStatus"), "single")).toBe("רווק/ה"));
  it("checkboxes", () => expect(formatAnswer(f("incomeTypes"), ["monthly", "extra"])).toBe("משכורת חודש, משכורת נוספת"));
  it("currency", () => expect(formatAnswer(f("salary"), 8500)).toBe("₪8,500"));
  it("composite part", () => expect(formatAnswer(f("bank"), validAnswers.bank, "branch")).toBe("912"));
  it("yes/no", () => expect(formatAnswer(f("hasChildren"), "yes")).toBe("כן"));
});

describe("PDF stamping", () => {
  it("resolves table cell references", () => {
    const answers = { children: [{ name: "דנה" }] };
    expect(resolveStampValue(sampleForm, answers, "children[0].name")?.value).toBe("דנה");
    expect(resolveStampValue(sampleForm, answers, "children[3].name")?.value).toBeUndefined();
    expect(resolveStampValue(sampleForm, answers, "nope")).toBeNull();
  });

  it("stamps text, checks and signature onto a template", async () => {
    const tpl = await PDFDocument.create();
    tpl.addPage([595, 842]);
    const templateBytes = await tpl.save();
    const mapping = pdfMappingSchema.parse({
      schemaVersion: 1,
      pages: [{ width: 595, height: 842 }],
      stamps: [
        { id: "s1", fieldId: "firstName", kind: "text", page: 0, x: 400, y: 780, width: 150, height: 16 },
        { id: "s2", fieldId: "address", part: "street", kind: "text", page: 0, x: 400, y: 760, width: 150, height: 16 },
        { id: "s3", fieldId: "incomeTypes", whenValue: "monthly", kind: "check", page: 0, x: 500, y: 740, width: 10, height: 10 },
        { id: "s4", fieldId: "sig", kind: "signature", page: 0, x: 50, y: 50, width: 120, height: 40 },
        { id: "s5", fieldId: "children[0].name", kind: "text", page: 0, x: 400, y: 700, width: 150, height: 16 },
      ],
    });
    const out = await stampPdf(templateBytes, mapping, sampleForm, { ...validAnswers, children: [{ name: "דנה" }] });
    expect(out.byteLength).toBeGreaterThan(templateBytes.byteLength);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });

  it("stamps comb, date, initials and repeats across pages", async () => {
    const tpl = await PDFDocument.create();
    for (let i = 0; i < 3; i++) tpl.addPage([595, 842]);
    const templateBytes = await tpl.save();
    const mapping = pdfMappingSchema.parse({
      schemaVersion: 1,
      pages: [0, 1, 2].map(() => ({ width: 595, height: 842 })),
      stamps: [
        { id: "c1", fieldId: "firstName", kind: "comb", page: 0, x: 300, y: 780, width: 180, height: 18, comb: { cells: 9 } },
        { id: "d1", fieldId: "firstName", kind: "date_signed", page: 0, x: 50, y: 50, width: 90, height: 16, dateFormat: "dd.mm.yyyy", bold: true, color: "#1a3c8c" },
        { id: "i1", fieldId: "firstName", kind: "initials", page: 0, repeatOnPages: [1, 2], x: 500, y: 20, width: 40, height: 16, valign: "bottom" },
      ],
    });
    const plain = await stampPdf(templateBytes, { ...mapping, stamps: [] }, sampleForm, validAnswers);
    const out = await stampPdf(templateBytes, mapping, sampleForm, validAnswers, { signedAt: new Date("2026-10-13T10:00:00Z") });
    expect(out.byteLength).toBeGreaterThan(plain.byteLength);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });

  it("rejects an invalid stamp colour", () => {
    const bad = { schemaVersion: 1, pages: [{ width: 1, height: 1 }], stamps: [{ id: "x", fieldId: "a", kind: "text", page: 0, x: 0, y: 0, width: 1, height: 1, color: "red" }] };
    expect(pdfMappingSchema.safeParse(bad).success).toBe(false);
  });
});

describe("computed fields", () => {
  const def = parseFormDefinition({
    schemaVersion: 1,
    title: "t",
    pages: [{
      id: "p", title: "",
      fields: [
        { id: "price", type: "number", label: "מחיר" },
        { id: "qty", type: "number", label: "כמות" },
        { id: "total", type: "currency", label: "סה״כ", formula: "{price} * {qty}", required: true },
        { id: "rows", type: "repeating_table", label: "שורות", fields: [
          { id: "amount", type: "number", label: "סכום" },
          { id: "double", type: "number", label: "כפול", formula: "{amount} * 2" },
        ] },
        { id: "sumRows", type: "number", label: "סכום שורות", formula: "sum({rows.double})" },
      ],
    }],
  }).data!;

  it("recomputes on the server whatever the client sent", () => {
    const r = validateAnswers(def, { price: 12, qty: 3, total: 999999, rows: [{ amount: 5 }, { amount: 7, double: 1 }] }, { today });
    expect(r.ok).toBe(true);
    expect(r.cleaned.total).toBe(36);
    expect(r.cleaned.rows).toEqual([{ amount: 5, double: 10 }, { amount: 7, double: 14 }]);
    expect(r.cleaned.sumRows).toBe(24);
  });

  it("never reports an error for a formula field, even a required one with empty inputs", () => {
    const r = validateAnswers(def, { rows: [] }, { today });
    expect(r.errors.total).toBeUndefined();
    expect(r.cleaned.total).toBeUndefined();
  });
});
