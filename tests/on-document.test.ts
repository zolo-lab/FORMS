import { describe, expect, it } from "vitest";
import { cellRef, setStampValue, stampValue, coversAll, inputAttrs, isLockedOnDocument, tabOrder, readCheck, readText, simpleStamps, writeCheck, writeText } from "@/lib/pdf/on-document";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import { allFields } from "@/lib/forms/schema";
import { sampleForm } from "./fixtures/sample-form";

const f = (id: string) => allFields(sampleForm).find((x) => x.id === id)!;
const base = { page: 0, x: 0, y: 0, width: 50, height: 12 };

describe("simpleStamps", () => {
  const mapping: PdfMapping = {
    schemaVersion: 1,
    pages: [{ width: 595, height: 842 }],
    stamps: [
      { id: "a", fieldId: "firstName", kind: "text", ...base },
      { id: "b", fieldId: "children[0].name", kind: "text", ...base },
      { id: "c", fieldId: "salary", kind: "text", ...base },
      { id: "d", fieldId: "address", part: "city", kind: "text", ...base },
      { id: "e", fieldId: "sig", kind: "signature", ...base },
    ],
  };
  it("keeps stamps of top-level fields present in the role's form", () => {
    const def = { ...sampleForm, pages: sampleForm.pages.map((p) => ({ ...p, fields: p.fields.filter((x) => x.id !== "salary") })) };
    expect(simpleStamps(mapping, def).map((s) => s.id)).toEqual(["a", "b", "d", "e"]);
  });
  it("includes table-cell stamps only for existing columns and rows within maxRows", () => {
    const m: PdfMapping = { ...mapping, stamps: [
      { id: "r0", fieldId: "children[0].name", kind: "text", ...base },
      { id: "r14", fieldId: "children[14].birthDate", kind: "text", ...base },
      { id: "r15", fieldId: "children[15].name", kind: "text", ...base },
      { id: "bad", fieldId: "children[0].nope", kind: "text", ...base },
    ] };
    expect(simpleStamps(m, sampleForm).map((s) => s.id)).toEqual(["r0", "r14"]);
  });
});

describe("table cell values", () => {
  it("reads and writes answers[table][row][col]", () => {
    const st = { fieldId: "children[1].name" };
    expect(stampValue({}, st)).toBeUndefined();
    const a = setStampValue({}, st, "דנה");
    expect(a).toEqual({ children: [{}, { name: "דנה" }] });
    expect(stampValue(a, st)).toBe("דנה");
    expect(setStampValue(a, st, undefined)).toEqual({});
    expect(cellRef("firstName")).toBeNull();
  });
});

describe("text stamps", () => {
  it("reads and writes plain values", () => {
    expect(readText(f("firstName"), "דנה", { ...base })).toBe("דנה");
    expect(writeText(f("firstName"), undefined, { ...base }, "שרה")).toBe("שרה");
  });
  it("reads and writes composite parts", () => {
    const st = { ...base, part: "city" };
    expect(readText(f("address"), { city: "חיפה", street: "x" }, st)).toBe("חיפה");
    expect(writeText(f("address"), { street: "x" }, st, "עכו")).toEqual({ street: "x", city: "עכו" });
  });
  it("numbers are written as numbers", () => {
    expect(writeText(f("salary"), undefined, { ...base }, "8500")).toBe(8500);
    expect(writeText(f("salary"), 8500, { ...base }, "")).toBeUndefined();
  });
});

describe("check stamps", () => {
  it("yes/no", () => {
    expect(readCheck(f("hasChildren"), "yes", { ...base, whenValue: "yes" })).toBe(true);
    expect(readCheck(f("hasChildren"), "yes", { ...base, whenValue: "no" })).toBe(false);
    expect(writeCheck(f("hasChildren"), undefined, { ...base, whenValue: "no" }, true)).toBe("no");
    expect(writeCheck(f("hasChildren"), "no", { ...base, whenValue: "no" }, false)).toBeUndefined();
  });
  it("radio sets the option", () => {
    expect(writeCheck(f("maritalStatus"), undefined, { ...base, whenValue: "married" }, true)).toBe("married");
  });
  it("checkboxes toggle membership", () => {
    const st = { ...base, whenValue: "extra" };
    expect(writeCheck(f("incomeTypes"), ["monthly"], st, true)).toEqual(["monthly", "extra"]);
    expect(writeCheck(f("incomeTypes"), ["monthly", "extra"], st, false)).toEqual(["monthly"]);
    expect(readCheck(f("incomeTypes"), ["extra"], st)).toBe(true);
  });
  it("consent is a boolean", () => {
    expect(writeCheck(f("declare"), undefined, { ...base }, true)).toBe(true);
    expect(readCheck(f("declare"), true, { ...base })).toBe(true);
  });
});

describe("coversAll", () => {
  const employeeDef = { ...sampleForm, pages: [{ id: "p", title: "p", fields: [f("firstName"), f("sig")] }] };
  const m = (ids: string[]): PdfMapping => ({ schemaVersion: 1, pages: [{ width: 1, height: 1 }], stamps: ids.map((id, i) => ({ id: `s${i}`, fieldId: id, kind: id === "sig" ? ("signature" as const) : ("text" as const), ...base })) });
  it("is true when every answerable field has a stamp", () => {
    expect(coversAll(m(["firstName", "sig"]), employeeDef)).toBe(true);
  });
  it("is false when a field has no stamp", () => {
    expect(coversAll(m(["firstName"]), employeeDef)).toBe(false);
  });
});

describe("comb, initials and computed fields", () => {
  const def = { ...sampleForm, pages: [{ id: "p", title: "p", fields: [f("idNumber"), f("firstName"), { id: "total", type: "number" as const, label: "סך", formula: "1 + 1" }, f("sig")] }] };
  const mapping: PdfMapping = {
    schemaVersion: 1,
    pages: [{ width: 1, height: 1 }],
    stamps: [
      { id: "c", fieldId: "idNumber", kind: "comb", comb: { cells: 9 }, ...base },
      { id: "i", fieldId: "firstName", kind: "initials", ...base },
      { id: "d", fieldId: "firstName", kind: "date_signed", ...base },
      { id: "g", fieldId: "sig", kind: "signature", ...base },
    ],
  };
  it("treats comb and initials as inputs but not date_signed", () => {
    expect(simpleStamps(mapping, def).map((s) => s.id)).toEqual(["c", "i", "g"]);
  });
  it("is covered even though the formula field has no stamp", () => {
    expect(coversAll(mapping, def)).toBe(true);
  });
  it("picks input attributes by field type", () => {
    expect(inputAttrs(f("birthDate")).type).toBe("date");
    expect(inputAttrs(f("idNumber")).inputMode).toBe("numeric");
    expect(inputAttrs(f("mobile")).type).toBe("tel");
    expect(inputAttrs(f("firstName")).type).toBe("text");
  });
});

describe("isLockedOnDocument", () => {
  it("a plain field (no disabledIf) is editable", () => {
    expect(isLockedOnDocument({ id: "a", type: "short_text", label: "א" }, {})).toBe(false);
  });
  it("locks computed, read-only and disabledIf-true fields", () => {
    expect(isLockedOnDocument({ id: "a", type: "number", label: "א", formula: "1 + 1" }, {})).toBe(true);
    expect(isLockedOnDocument({ id: "a", type: "short_text", label: "א", readOnly: true }, {})).toBe(true);
    const cond = { field: "x", op: "eq" as const, value: "1" };
    expect(isLockedOnDocument({ id: "a", type: "short_text", label: "א", disabledIf: cond }, { x: "1" })).toBe(true);
    expect(isLockedOnDocument({ id: "a", type: "short_text", label: "א", disabledIf: cond }, { x: "2" })).toBe(false);
  });
});

describe("tabOrder", () => {
  it("explicit tabIndex first, then top-to-bottom, start-to-end, per page", () => {
    const st = [
      { id: "c", page: 0, x: 10, y: 700 },
      { id: "a", page: 0, x: 200, y: 700, tabIndex: 1 },
      { id: "d", page: 0, x: 10, y: 600 },
      { id: "b", page: 0, x: 300, y: 500, tabIndex: 2 },
      { id: "e", page: 0, x: 50, y: 700 },
      { id: "z", page: 1, x: 0, y: 800, tabIndex: 0 },
    ];
    expect(tabOrder(st).map((s) => s.id)).toEqual(["a", "b", "c", "e", "d", "z"]);
  });
});
