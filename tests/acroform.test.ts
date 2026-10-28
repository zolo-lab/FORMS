import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { importAcroForm, mergeAcroImport } from "@/lib/pdf/acroform";
import { pdfMappingSchema, stampPdf } from "@/lib/forms/pdf-mapping";
import { parseFormDefinition } from "@/lib/forms/schema";

async function fillablePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  doc.addPage([595, 842]);
  const form = doc.getForm();
  const name = form.createTextField("full_name");
  name.addToPage(doc.getPage(0), { x: 50, y: 700, width: 200, height: 20 });
  const id = form.createTextField("id_number");
  id.setMaxLength(9);
  id.enableCombing();
  id.addToPage(doc.getPage(0), { x: 50, y: 650, width: 180, height: 20 });
  const agree = form.createCheckBox("agree");
  agree.addToPage(doc.getPage(1), { x: 50, y: 600, width: 14, height: 14 });
  const status = form.createRadioGroup("status");
  status.addOptionToPage("single", doc.getPage(1), { x: 50, y: 500, width: 12, height: 12 });
  status.addOptionToPage("married", doc.getPage(1), { x: 120, y: 500, width: 12, height: 12 });
  const city = form.createDropdown("city");
  city.addOptions(["Haifa", "Tel Aviv"]);
  city.addToPage(doc.getPage(1), { x: 50, y: 400, width: 100, height: 20 });
  return doc.save();
}

describe("AcroForm import", () => {
  it("imports text, comb, checkbox, radio and dropdown fields with positions and pages", async () => {
    const imp = await importAcroForm(await fillablePdf());
    expect(imp.acroImported).toBe(true);
    expect(imp.fields.map((f) => f.type)).toEqual(["short_text", "short_text", "consent", "radio", "dropdown"]);
    const byField = (id: string) => imp.stamps.filter((s) => s.fieldId === id);
    const first = byField("acro_1")[0]!;
    expect(first).toMatchObject({ kind: "text", page: 0 });
    // pdf-lib widens widgets slightly for the border, so compare with a tolerance.
    expect(first.x).toBeCloseTo(50, -1);
    expect(first.width).toBeCloseTo(200, -1);
    expect(first.height).toBeCloseTo(20, -1);
    expect(byField("acro_2")[0]).toMatchObject({ kind: "comb", comb: { cells: 9 } });
    expect(byField("acro_3")[0]).toMatchObject({ kind: "check", page: 1 });
    expect(byField("acro_4").map((s) => s.whenValue)).toEqual(["single", "married"]);
    expect(imp.fields[3]!.options?.map((o) => o.value)).toEqual(["single", "married"]);
  });

  it("merges into a form without id clashes and yields a valid definition and mapping", async () => {
    const imp = await importAcroForm(await fillablePdf());
    const def = parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p", title: "", fields: [{ id: "acro_1", type: "short_text", label: "x" }] }] }).data!;
    const merged = mergeAcroImport(def, imp);
    expect(parseFormDefinition(merged.definition).success).toBe(true);
    const ids = merged.definition.pages[0]!.fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const mapping = { schemaVersion: 1, pages: [{ width: 595, height: 842 }, { width: 595, height: 842 }], stamps: merged.stamps, acroImported: true };
    expect(pdfMappingSchema.safeParse(mapping).success).toBe(true);
    expect(new Set(merged.stamps.map((s) => s.id)).size).toBe(merged.stamps.length);
  });

  it("flattens the interactive fields when stamping", async () => {
    const bytes = await fillablePdf();
    const imp = await importAcroForm(bytes);
    const def = parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p", title: "", fields: imp.fields }] }).data!;
    const mapping = pdfMappingSchema.parse({ schemaVersion: 1, pages: [{ width: 595, height: 842 }, { width: 595, height: 842 }], stamps: imp.stamps, acroImported: true });
    const out = await stampPdf(bytes, mapping, def, { acro_1: "ישראל ישראלי", acro_2: "000000018", acro_3: true, acro_4: "married" });
    expect((await PDFDocument.load(out)).getForm().getFields()).toHaveLength(0);
  });

  it("returns nothing for a PDF without fields", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const imp = await importAcroForm(await doc.save());
    expect(imp).toEqual({ fields: [], stamps: [], acroImported: false });
  });
});

describe("AcroForm text field types", () => {
  it("reads the type from the comb and the field name", async () => {
    const { textType } = await import("@/lib/pdf/acroform");
    expect(textType("anything", false, 9)).toBe("id_number");
    expect(textType("מספר זהות", false, 0)).toBe("id_number");
    expect(textType("ת.ז. העובד", false, 0)).toBe("id_number");
    expect(textType("id_number", false, 0)).toBe("id_number");
    expect(textType("טלפון נייד", false, 0)).toBe("phone");
    expect(textType("חתימת העובד", false, 0)).toBe("short_text");
    expect(textType("הערות", true, 0)).toBe("long_text");
  });
});
