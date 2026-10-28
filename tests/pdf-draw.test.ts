import { describe, expect, it } from "vitest";
import { addDetectedFields, orderByPdf, splitStepAt, addDrawnElement, cloneField, insertFieldByPosition, PDF_PALETTE, readingOrder, uniqueFieldId } from "@/lib/forms/pdf-draw";
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

  it("with no placed fields the new field goes to the end of the last page", () => {
    const base = def([
      { id: "p1", fields: [{ id: "a", type: "short_text", label: "שם" }] },
      { id: "p2", fields: [{ id: "b", type: "short_text", label: "עיר" }] },
    ]);
    const r = addDrawnElement(base, entry("text"), 0, { x: 0, y: 0 }, () => "s");
    expect(r.definition.pages).toHaveLength(2);
    expect(r.definition.pages[0]!.fields.map((f) => f.id)).toEqual(["a"]);
    expect(r.definition.pages[1]!.fields.map((f) => f.id)).toEqual(["b", r.stamp.fieldId]);
  });

  it("drawing a field inserts it in the form where its position suggests", () => {
    const base = def([{ id: "p1", fields: [
      { id: "a", type: "short_text", label: "א" },
      { id: "b", type: "short_text", label: "ב" },
      { id: "c", type: "short_text", label: "ג" },
    ] }]);
    const st = (fieldId: string, page: number, x: number, y: number) => ({ id: fieldId, fieldId, kind: "text" as const, page, x, y, width: 100, height: 16 });
    const stamps = [st("a", 0, 400, 700), st("b", 0, 400, 500), st("c", 1, 400, 600)];
    const mid = addDrawnElement(base, entry("text"), 0, { x: 400, y: 600 }, () => "n", stamps);
    expect(mid.definition.pages[0]!.fields.map((f) => f.id)).toEqual(["a", mid.stamp.fieldId, "b", "c"]);
    const top = addDrawnElement(base, entry("text"), 0, { x: 400, y: 790 }, () => "n", stamps);
    expect(top.definition.pages[0]!.fields.map((f) => f.id)).toEqual([top.stamp.fieldId, "a", "b", "c"]);
    const lastPage = addDrawnElement(base, entry("text"), 1, { x: 400, y: 100 }, () => "n", stamps);
    expect(lastPage.definition.pages[0]!.fields.map((f) => f.id)).toEqual(["a", "b", "c", lastPage.stamp.fieldId]);
  });

  it("insertFieldByPosition: three fields drawn bottom to top end up top to bottom", () => {
    let d = def([{ id: "p1", fields: [] }]);
    const stamps: { id: string; fieldId: string; kind: "text"; page: number; x: number; y: number; width: number; height: number }[] = [];
    for (const [i, y] of [100, 300, 500].entries()) {
      const f = { id: `f${i}`, type: "short_text" as const, label: `ש${i}` };
      const st = { id: `s${i}`, fieldId: f.id, kind: "text" as const, page: 0, x: 300, y, width: 100, height: 16 };
      d = insertFieldByPosition(d, f, st, stamps);
      stamps.push(st);
    }
    expect(d.pages[0]!.fields.map((f) => f.id)).toEqual(["f2", "f1", "f0"]);
  });

  it("readingOrder: page, then top to bottom, then right to left", () => {
    const b = (page: number, x: number, y: number) => ({ page, x, y, width: 50, height: 10 });
    expect(readingOrder(b(0, 0, 0), b(1, 0, 900))).toBeLessThan(0);
    expect(readingOrder(b(0, 0, 700), b(0, 0, 100))).toBeLessThan(0);
    expect(readingOrder(b(0, 400, 700), b(0, 100, 702))).toBeLessThan(0); // same row: right first
    expect(readingOrder(b(0, 100, 700), b(0, 400, 700))).toBeGreaterThan(0);
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
    expect(allFields(merged.definition).map((f) => f.label)).toEqual(["א", "fullname"]);
    expect(merged.definition.pages[0]!.fields).toHaveLength(1);
    expect(merged.definition.pages[1]!.fields).toHaveLength(1);
  });

  it("imported fields are ordered by their position among the fields already placed", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    doc.getForm().createTextField("low").addToPage(page, { x: 10, y: 20, width: 100, height: 20 });
    doc.getForm().createTextField("high").addToPage(page, { x: 10, y: 250, width: 100, height: 20 });
    const imp = await importAcroForm(await doc.save());
    const base = def([{ id: "p1", fields: [{ id: "mid", type: "short_text", label: "אמצע" }] }]);
    const existing = [{ id: "m", fieldId: "mid", kind: "text" as const, page: 0, x: 10, y: 130, width: 100, height: 20 }];
    const merged = mergeAcroImport(base, imp, existing);
    expect(allFields(merged.definition).map((f) => f.label)).toEqual(["high", "אמצע", "low"]);
  });
});

describe("addDetectedFields", () => {
  const box = (x: number, y: number, width = 120, height = 16) => ({ x, y, width, height });
  const detected = [
    { id: "d2", label: "מין", type: "radio" as const, page: 0, box: box(400, 500, 80, 10), options: [{ label: "זכר", box: box(480, 500, 10, 10) }, { label: "נקבה", box: box(420, 500, 10, 10) }] },
    { id: "d0", label: "שם משפחה", type: "short_text" as const, page: 0, box: box(300, 758) },
    { id: "d1", label: "תעודת זהות", type: "id_number" as const, page: 0, box: box(250, 716, 162, 18), comb: 9 },
    { id: "d3", label: "חתימה", type: "signature" as const, page: 1, box: box(300, 100, 200, 40) },
    { id: "d4", label: "האם עבדת בעבר", type: "yes_no" as const, page: 1, box: box(400, 300, 80, 10), options: [{ label: "כן", box: box(480, 300, 10, 10) }, { label: "לא", box: box(420, 300, 10, 10) }] },
  ];
  let n = 0;
  const run = (opts = {}) => addDetectedFields(empty(), detected, [], () => `s${++n}`, opts);

  it("adds ordinary fields in the PDF's reading order, with a dashed-suggestion stamp for each", () => {
    const { definition, stamps } = run();
    expect(allFields(definition).map((f) => f.label)).toEqual(["שם משפחה", "תעודת זהות", "מין", "האם עבדת בעבר", "חתימה"]);
    expect(stamps.every((s) => s.guessed === true)).toBe(true);
    expect(parseFormDefinition(definition).success).toBe(true);
  });
  it("builds the stamps by kind: comb, signature, one square per option", () => {
    const { definition, stamps } = run();
    const id = (label: string) => allFields(definition).find((f) => f.label === label)!.id;
    expect(stamps.find((s) => s.fieldId === id("תעודת זהות"))).toMatchObject({ kind: "comb", comb: { cells: 9 } });
    expect(stamps.find((s) => s.fieldId === id("חתימה"))).toMatchObject({ kind: "signature", page: 1 });
    const radio = allFields(definition).find((f) => f.label === "מין")!;
    expect(radio.options!.map((o) => o.label)).toEqual(["זכר", "נקבה"]);
    expect(stamps.filter((s) => s.fieldId === radio.id).map((s) => [s.kind, s.whenValue])).toEqual([["check", "o1"], ["check", "o2"]]);
    expect(stamps.filter((s) => s.fieldId === id("האם עבדת בעבר")).map((s) => s.whenValue).sort()).toEqual(["no", "yes"]);
    expect(pdfMappingSchema.safeParse({ schemaVersion: 1, pages: [{ width: 595, height: 842 }, { width: 595, height: 842 }], stamps }).success).toBe(true);
  });
  it("splits an empty form into one step per PDF page when asked", () => {
    const { definition } = run({ stepPerPage: true });
    expect(definition.pages.map((p) => [p.title, p.fields.map((f) => f.label)])).toEqual([
      ["שלב 1", ["שם משפחה", "תעודת זהות", "מין"]],
      ["שלב 2", ["האם עבדת בעבר", "חתימה"]],
    ]);
    expect(new Set(definition.pages.map((p) => p.id)).size).toBe(2);
  });
  it("keeps a form that already has fields in one piece and slots the new ones by position", () => {
    const base = def([{ id: "p1", fields: [{ id: "a", type: "short_text", label: "ראשון" }, { id: "b", type: "short_text", label: "אחרון" }] }]);
    const stamps = [
      { id: "x1", fieldId: "a", kind: "text" as const, page: 0, x: 300, y: 800, width: 100, height: 16 },
      { id: "x2", fieldId: "b", kind: "text" as const, page: 0, x: 300, y: 100, width: 100, height: 16 },
    ];
    const { definition } = addDetectedFields(base, [detected[1]!], stamps, () => "n", { stepPerPage: true });
    expect(definition.pages).toHaveLength(1);
    expect(allFields(definition).map((f) => f.label)).toEqual(["ראשון", "שם משפחה", "אחרון"]);
  });
});

describe("orderByPdf", () => {
  const st = (fieldId: string, page: number, x: number, y: number) => ({ id: `s_${fieldId}`, fieldId, kind: "text" as const, page, x, y, width: 100, height: 16 });
  const f = (id: string, type = "short_text") => ({ id, type, label: id });
  it("orders each step by the document: page, top to bottom, right to left", () => {
    const d = def([{ id: "p1", fields: [f("c"), f("a"), f("b"), f("d")] }]);
    const out = orderByPdf(d, [st("a", 0, 400, 700), st("b", 0, 100, 700), st("c", 1, 300, 800), st("d", 0, 300, 500)]);
    expect(out.pages[0]!.fields.map((x) => x.id)).toEqual(["a", "b", "d", "c"]);
  });
  it("keeps unplaced fields and layout blocks right after the field they followed, and never moves ids between steps", () => {
    const d = def([{ id: "p1", fields: [f("intro", "heading"), f("b"), f("note", "info_text"), f("a")] }, { id: "p2", fields: [f("z")] }]);
    const out = orderByPdf(d, [st("a", 0, 300, 700), st("b", 0, 300, 400), st("z", 0, 300, 900)]);
    expect(out.pages.map((p) => p.fields.map((x) => x.id))).toEqual([["intro", "a", "b", "note"], ["z"]]);
  });
  it("counts a table's cells for the table", () => {
    const d = def([{ id: "p1", fields: [f("t", "short_text"), f("a")] }]);
    const out = orderByPdf(d, [st("t[0].c", 0, 300, 100), st("a", 0, 300, 700)]);
    expect(out.pages[0]!.fields.map((x) => x.id)).toEqual(["a", "t"]);
  });
});

describe("splitStepAt", () => {
  const fields = ["a", "b", "c", "d"].map((id) => ({ id, type: "short_text", label: id }));
  it("moves the field and the ones after it to a new step", () => {
    const r = splitStepAt(def([{ id: "p1", fields }]), "c")!;
    expect(r.definition.pages.map((p) => p.fields.map((x) => x.id))).toEqual([["a", "b"], ["c", "d"]]);
    expect(r.step).toBe(1);
    expect(r.definition.pages[1]!.title).toBe("שלב 2");
    expect(parseFormDefinition(r.definition).success).toBe(true);
  });
  it("does nothing at the first field of a step or for an unknown field", () => {
    const d = def([{ id: "p1", fields }]);
    expect(splitStepAt(d, "a")).toBeNull();
    expect(splitStepAt(d, "nope")).toBeNull();
  });
  it("keeps the skip rules on the half where the step now ends", () => {
    const d = parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p1", title: "", fields, nextPage: [{ if: { field: "a", op: "eq", value: "x" }, goTo: "end" }] }] }).data!;
    const r = splitStepAt(d, "c")!;
    expect(r.definition.pages[0]!.nextPage).toBeUndefined();
    expect(r.definition.pages[1]!.nextPage).toHaveLength(1);
  });
});

describe("addDetectedFields with tables and keys", () => {
  it("uses the detected key as the field id", () => {
    const { definition } = addDetectedFields(empty(), [{ id: "d0", label: "שם פרטי", type: "short_text", page: 0, box: { x: 300, y: 700, width: 120, height: 16 }, key: "employee_firstName" }], [], () => "s");
    expect(allFields(definition)[0]!.id).toBe("employee_firstName");
  });
  it("makes a repeating table with a stamp per row and column", () => {
    let n = 0;
    const { definition, stamps } = addDetectedFields(
      empty(),
      [{
        id: "d0", label: "פרטים על ילדיי", type: "repeating_table", page: 0, box: { x: 256, y: 374, width: 284, height: 102 }, key: "children",
        columns: [
          { key: "name", label: "שם", type: "short_text", x: 445, width: 90 },
          { key: "birthDate", label: "תאריך לידה", type: "date", x: 258, width: 90 },
        ],
        rows: [{ y: 441.5, height: 16 }, { y: 419.5, height: 16 }, { y: 397.5, height: 16 }],
      }],
      [],
      () => `s${++n}`,
    );
    const table = allFields(definition)[0]!;
    expect(table).toMatchObject({ id: "children", type: "repeating_table", settings: { maxRows: 3 } });
    expect(table.fields!.map((f) => [f.id, f.type])).toEqual([["name", "short_text"], ["birthDate", "date"]]);
    expect(stamps.map((s) => s.fieldId)).toEqual(["children[0].name", "children[0].birthDate", "children[1].name", "children[1].birthDate", "children[2].name", "children[2].birthDate"]);
    expect(stamps[2]).toMatchObject({ x: 445, y: 419.5, kind: "text", guessed: true });
    expect(parseFormDefinition(definition).success).toBe(true);
  });
});

describe("PDF palette uses the responsive editor's field types", () => {
  it("names every field element like the field type, grouped by the same categories", async () => {
    const { pdfPaletteGroups, pdfPaletteEntry } = await import("@/lib/forms/pdf-draw");
    const { FIELD_TYPE_META, FIELD_CATEGORY_LABELS } = await import("@/lib/forms/field-types");
    const groups = pdfPaletteGroups();
    const fieldEntries = groups.flatMap((g) => g.entries).filter((e) => e.fieldType);
    for (const e of fieldEntries) expect(e.label).toBe(FIELD_TYPE_META[e.fieldType!].label);
    expect(groups.map((g) => g.label)).toContain(FIELD_CATEGORY_LABELS.israeli);
    expect(pdfPaletteEntry("id")?.stamp).toMatchObject({ kind: "comb", comb: { cells: 9 } });
    expect(pdfPaletteEntry("time")?.fieldType).toBe("time");
    expect(fieldEntries.some((e) => e.fieldType === "heading" || e.fieldType === "file_upload")).toBe(false);
    expect(groups.at(-1)!.entries.map((e) => e.id)).toEqual(["initials", "date_signed", "stamp"]);
  });
});
