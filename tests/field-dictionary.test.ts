import { describe, expect, it } from "vitest";
import { DICTIONARY_HEADER, fieldDictionary, isGeneratedId, renameStamps, suggestFieldIds } from "@/lib/forms/field-dictionary";
import type { FormDefinition } from "@/lib/forms/schema";
import type { PdfStamp } from "@/lib/forms/pdf-mapping";

const def = {
  schemaVersion: 1,
  title: "טופס",
  pages: [
    {
      id: "p1",
      title: "פרטי העובד",
      fields: [
        { id: "pdf_short_text_1", type: "short_text", label: "שם פרטי", required: true },
        { id: "heading", type: "heading", label: "כותרת" },
        { id: "gender", type: "radio", label: "מין", options: [{ value: "m", label: "זכר" }, { value: "f", label: "נקבה" }] },
      ],
    },
    {
      id: "p2",
      title: "פרטים על בן/בת הזוג",
      fields: [
        { id: "short_text_2", type: "short_text", label: "שם פרטי", exportKey: "SPOUSE_NAME" },
        { id: "children", type: "repeating_table", label: "ילדים", fields: [{ id: "name", type: "short_text", label: "שם" }, { id: "birthDate", type: "date", label: "תאריך לידה" }] },
      ],
    },
  ],
} as unknown as FormDefinition;

const stamp = (fieldId: string, page: number): PdfStamp => ({ id: fieldId, fieldId, page, kind: "text", x: 0, y: 0, width: 10, height: 10 }) as PdfStamp;

describe("field dictionary", () => {
  const rows = fieldDictionary(def, [stamp("pdf_short_text_1", 0), stamp("children[0].name", 1), stamp("children[1].name", 1)]);
  it("lists every answer field, table columns included, in form order", () => {
    expect(rows[0]).toEqual(DICTIONARY_HEADER);
    expect(rows.slice(1).map((r) => r[0])).toEqual(["pdf_short_text_1", "gender", "short_text_2", "children", "children[].name", "children[].birthDate"]);
  });
  it("fills export key, step, filler, required, options and PDF page", () => {
    const first = rows[1]!;
    expect(first.slice(2)).toEqual(["שם פרטי", "תשובה קצרה", "פרטי העובד", "העובד", "כן", "", "1"]);
    expect(rows[2]![7]).toBe("זכר | נקבה");
    expect(rows[3]![1]).toBe("SPOUSE_NAME");
    expect(rows[5]![2]).toBe("ילדים – שם");
    expect(rows[5]![8]).toBe("2");
  });
});

describe("automatic ids", () => {
  it("recognises generated ids", () => {
    expect(isGeneratedId("pdf_short_text_3")).toBe(true);
    expect(isGeneratedId("short_text_2")).toBe(true);
    expect(isGeneratedId("date")).toBe(true);
    expect(isGeneratedId("employee_firstName")).toBe(false);
    expect(isGeneratedId("gender")).toBe(false);
  });
  it("suggests readable, unique ids from label and step", () => {
    expect(suggestFieldIds(def)).toEqual([
      ["pdf_short_text_1", "employee_firstName"],
      ["short_text_2", "spouse_firstName"],
    ]);
  });
  it("moves the stamps with the field, table cells too", () => {
    const out = renameStamps([stamp("a", 0), stamp("a[2].name", 0), stamp("ab", 0)], "a", "b");
    expect(out.map((s) => s.fieldId)).toEqual(["b", "b[2].name", "ab"]);
  });
});
