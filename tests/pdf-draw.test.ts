import { describe, expect, it } from "vitest";
import { addDrawnElement, cloneField, PDF_PALETTE, uniqueFieldId } from "@/lib/forms/pdf-draw";
import { allFields, parseFormDefinition, stripLegacyPdfOnly } from "@/lib/forms/schema";
import { pdfMappingSchema } from "@/lib/forms/pdf-mapping";
import { importAcroForm, mergeAcroImport } from "@/lib/pdf/acroform";
import { PDFDocument } from "pdf-lib";

const def = (pages: { id: string; fields: { id: string; type: string; label: string }[] }[]) =>
  parseFormDefinition({ schemaVersion: 1, title: "t", pages: pages.map((p) => ({ title: "", ...p })) }).data!;
const empty = () => def([{ id: "p1", fields: [] }]);
const entry = (id: string) => PDF_PALETTE.find((e) => e.id === id)!;

describe("elements drawn on the PDF are ordinary form fields", () => {
  it("creates a plain field and a stamp together", () => {
    let n = 0;
    const { definition, stamp } = addDrawnElement(empty(), entry("id"), 0, { x: 100, y: 200 }, () => `s${++n}`);
    const f = definition.pages[0]!.fields[0]!;
    expect(f).toMatchObject({ type: "id_number", label: "מספר זהות" });
    expect(f.settings).toBeUndefined();
    expect(stamp).toMatchObject({ kind: "comb", fieldId: f.id, comb: { cells: 9 }, x: 100, y: 200, page: 0 });
    expect(parseFormDefinition(definition).success).toBe(true);
    expect(pdfMappingSchema.safeParse({ schemaVersion: 1, pages: [{ width: 1, height: 1 }], stamps: [stamp] }).success).toBe(true);
  });

  it("adds no special page: the field goes to the last page, or to the page asked for", () => {
    const base = def([
      { id: "p1", fields: [{ id: "a", type: "short_text", label: "שם" }] },
      { id: "p2", fields: [{ id: "b", type: "short_text", label: "עיר" }] },
    ]);
    const r = addDrawnElement(base, entry("text"), 0, { x: 0, y: 0 }, () => "s");
    expect(r.definition.pages).toHaveLength(2);
    expect(r.definition.pages[0]!.fields.map((f) => f.id)).toEqual(["a"]);
    expect(r.definition.pages[1]!.fields.map((f) => f.id)).toEqual(["b", r.stamp.fieldId]);
    const first = addDrawnElement(base, entry("text"), 0, { x: 0, y: 0 }, () => "s", 0);
    expect(first.definition.pages[0]!.fields.map((f) => f.id)).toEqual(["a", first.stamp.fieldId]);
    const outOfRange = addDrawnElement(base, entry("text"), 0, { x: 0, y: 0 }, () => "s", 9);
    expect(outOfRange.definition.pages[1]!.fields).toHaveLength(2);
  });

  it("keeps ids unique across repeated adds", () => {
    let d = empty();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = addDrawnElement(d, entry("text"), 0, { x: 0, y: 0 }, () => `s${i}`);
      d = r.definition;
      ids.push(r.stamp.fieldId);
    }
    expect(new Set(ids).size).toBe(3);
    expect(uniqueFieldId(d, "pdf_text_")).toBe("pdf_text_4");
  });

  it("stamp-only elements add no field", () => {
    const { definition, stamp } = addDrawnElement(empty(), entry("date_signed"), 1, { x: 5, y: 5 }, () => "d");
    expect(definition.pages[0]!.fields).toHaveLength(0);
    expect(stamp).toMatchObject({ kind: "date_signed", page: 1 });
  });

  it("radio/dropdown elements come with options; the image stamp adds no field", () => {
    const r = addDrawnElement(empty(), entry("radio"), 0, { x: 0, y: 0 }, () => "r");
    const f = r.definition.pages[0]!.fields[0]!;
    expect(f.type).toBe("radio");
    expect(f.options?.length).toBe(2);
    expect(r.stamp).toMatchObject({ kind: "check", whenValue: "o1" });
    const m = addDrawnElement(empty(), entry("multi"), 0, { x: 0, y: 0 }, () => "m");
    expect(m.definition.pages[0]!.fields[0]).toMatchObject({ type: "checkboxes", options: [{ value: "o1" }, { value: "o2" }] });
    const d = addDrawnElement(empty(), entry("dropdown"), 0, { x: 0, y: 0 }, () => "d");
    expect(d.definition.pages[0]!.fields[0]!.options?.length).toBe(2);
    const s = addDrawnElement(empty(), entry("stamp"), 0, { x: 0, y: 0 }, () => "s");
    expect(s.definition.pages[0]!.fields).toHaveLength(0);
    expect(s.stamp).toMatchObject({ kind: "stamp_image", width: 90, height: 90 });
  });

  it("cloneField copies a field right after the original under a new id", () => {
    const r = addDrawnElement(empty(), entry("radio"), 0, { x: 0, y: 0 }, () => "r");
    const id = r.stamp.fieldId;
    const c = cloneField(r.definition, id)!;
    expect(c.fieldId).toBe("pdf_radio_2");
    const fields = c.definition.pages[0]!.fields;
    expect(fields.map((f) => f.id)).toEqual([id, "pdf_radio_2"]);
    expect(fields[1]!.options).toEqual(fields[0]!.options);
    expect(parseFormDefinition(c.definition).success).toBe(true);
    expect(cloneField(c.definition, id)!.fieldId).toBe("pdf_radio_3");
    expect(cloneField(c.definition, "_stamp")).toBeNull();
    expect(cloneField(c.definition, "rows[0].x")).toBeNull();
  });
});

describe("legacy pdfOnly flag", () => {
  const legacy = {
    schemaVersion: 1,
    title: "t",
    pages: [
      { id: "p1", title: "", fields: [{ id: "a", type: "short_text", label: "שם" }] },
      {
        id: "pdf_fields",
        title: "שדות במסמך",
        fields: [
          { id: "pdf_text_1", type: "short_text", label: "טקסט", settings: { pdfOnly: true } },
          { id: "acro_1", type: "short_text", label: "x", settings: { pdfOnly: true, acroName: "x" } },
        ],
      },
    ],
  };

  it("is dropped on parse; other settings stay; the old page stays as an ordinary page", () => {
    const parsed = parseFormDefinition(legacy);
    expect(parsed.success).toBe(true);
    const d = parsed.data!;
    expect(d.pages.map((p) => p.id)).toEqual(["p1", "pdf_fields"]);
    const [a, b] = d.pages[1]!.fields;
    expect(a!.settings).toBeUndefined();
    expect(b!.settings).toEqual({ acroName: "x" });
    expect(JSON.stringify(d)).not.toContain("pdfOnly");
  });

  it("returns the same object when there is nothing to strip", () => {
    const d = empty();
    expect(stripLegacyPdfOnly(d)).toBe(d);
  });
});

describe("AcroForm import", () => {
  it("imports fillable fields as ordinary fields on the last page", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const tf = doc.getForm().createTextField("fullname");
    tf.addToPage(page, { x: 10, y: 10, width: 100, height: 20 });
    const imp = await importAcroForm(await doc.save());
    expect(imp.fields).toHaveLength(1);
    expect(imp.fields[0]!.settings).toEqual({ acroName: "fullname" });
    const base = def([
      { id: "p1", fields: [{ id: "a", type: "short_text", label: "א" }] },
      { id: "p2", fields: [] },
    ]);
    const merged = mergeAcroImport(base, imp);
    expect(merged.definition.pages[0]!.fields).toHaveLength(1);
    expect(allFields(merged.definition).map((f) => f.label)).toEqual(["א", "fullname"]);
    expect(merged.definition.pages[1]!.fields).toHaveLength(1);
  });
});
