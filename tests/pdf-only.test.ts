import { describe, expect, it } from "vitest";
import { addPdfOnlyElement, dropPdfOnlyField, pdfOnlyFieldOf, PDF_FIELDS_PAGE_ID, PDF_PALETTE, restorePdfOnlyField, uniqueFieldId } from "@/lib/forms/pdf-only";
import { parseFormDefinition } from "@/lib/forms/schema";
import { pdfMappingSchema } from "@/lib/forms/pdf-mapping";

const empty = () => parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p1", title: "", fields: [] }] }).data!;
const entry = (id: string) => PDF_PALETTE.find((e) => e.id === id)!;

describe("pdf-only elements", () => {
  it("creates a field and a stamp together", () => {
    let n = 0;
    const { definition, stamp } = addPdfOnlyElement(empty(), entry("id"), 0, { x: 100, y: 200 }, () => `s${++n}`);
    const f = definition.pages.find((p) => p.id === PDF_FIELDS_PAGE_ID)!.fields[0]!;
    expect(f).toMatchObject({ type: "id_number", settings: { pdfOnly: true } });
    expect(stamp).toMatchObject({ kind: "comb", fieldId: f.id, comb: { cells: 9 }, x: 100, y: 200, page: 0 });
    expect(parseFormDefinition(definition).success).toBe(true);
    expect(pdfMappingSchema.safeParse({ schemaVersion: 1, pages: [{ width: 1, height: 1 }], stamps: [stamp] }).success).toBe(true);
  });

  it("puts drawn fields on their own page, not the regular questions", () => {
    const base = parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p1", title: "", fields: [{ id: "a", type: "short_text", label: "שם" }] }] }).data!;
    const r = addPdfOnlyElement(base, entry("text"), 0, { x: 0, y: 0 }, () => "s");
    expect(r.definition.pages[0]!.fields.map((f) => f.id)).toEqual(["a"]);
    expect(r.definition.pages[1]).toMatchObject({ id: PDF_FIELDS_PAGE_ID, title: "שדות במסמך" });
    const r2 = addPdfOnlyElement(r.definition, entry("id"), 0, { x: 0, y: 0 }, () => "s2");
    expect(r2.definition.pages).toHaveLength(2);
  });

  it("keeps ids unique across repeated adds", () => {
    let def = empty();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = addPdfOnlyElement(def, entry("text"), 0, { x: 0, y: 0 }, () => `s${i}`);
      def = r.definition;
      ids.push(r.stamp.fieldId);
    }
    expect(new Set(ids).size).toBe(3);
    expect(uniqueFieldId(def, "pdf_text_")).toBe("pdf_text_4");
  });

  it("stamp-only elements add no field", () => {
    const { definition, stamp } = addPdfOnlyElement(empty(), entry("date_signed"), 1, { x: 5, y: 5 }, () => "d");
    expect(definition.pages[0]!.fields).toHaveLength(0);
    expect(stamp).toMatchObject({ kind: "date_signed", page: 1 });
  });

  it("drops only pdf-only fields", () => {
    const { definition, stamp } = addPdfOnlyElement(empty(), entry("signature"), 0, { x: 0, y: 0 }, () => "x");
    const dropped = dropPdfOnlyField(definition, stamp.fieldId);
    expect(dropped.pages.some((p) => p.id === PDF_FIELDS_PAGE_ID)).toBe(false);
    expect(dropped.pages[0]!.fields).toHaveLength(0);
    const normal = parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p1", title: "", fields: [{ id: "a", type: "short_text", label: "א" }] }] }).data!;
    expect(dropPdfOnlyField(normal, "a")).toBe(normal);
  });

  it("a dropped field can be restored (undo of a stamp deletion)", () => {
    const { definition, stamp } = addPdfOnlyElement(empty(), entry("id"), 0, { x: 0, y: 0 }, () => "x");
    const field = pdfOnlyFieldOf(definition, stamp.fieldId)!;
    expect(field).toBeDefined();
    const dropped = dropPdfOnlyField(definition, stamp.fieldId);
    const restored = restorePdfOnlyField(dropped, field);
    expect(restored.pages.find((p) => p.id === PDF_FIELDS_PAGE_ID)!.fields).toEqual([field]);
    expect(restorePdfOnlyField(restored, field)).toBe(restored);
  });

  it("radio/dropdown elements come with options; the image stamp adds no field", () => {
    const r = addPdfOnlyElement(empty(), entry("radio"), 0, { x: 0, y: 0 }, () => "r");
    const f = r.definition.pages.find((p) => p.id === PDF_FIELDS_PAGE_ID)!.fields[0]!;
    expect(f.type).toBe("radio");
    expect(f.options?.length).toBe(2);
    expect(r.stamp).toMatchObject({ kind: "check", whenValue: "o1" });
    const d = addPdfOnlyElement(empty(), entry("dropdown"), 0, { x: 0, y: 0 }, () => "d");
    expect(d.definition.pages.find((p) => p.id === PDF_FIELDS_PAGE_ID)!.fields[0]!.options?.length).toBe(2);
    const s = addPdfOnlyElement(empty(), entry("stamp"), 0, { x: 0, y: 0 }, () => "s");
    expect(s.definition.pages).toHaveLength(1);
    expect(s.stamp).toMatchObject({ kind: "stamp_image", width: 90, height: 90 });
  });
});
