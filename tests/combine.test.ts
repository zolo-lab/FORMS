import { describe, expect, it } from "vitest";
import { combineForms } from "@/lib/forms/combine";
import type { PdfStamp } from "@/lib/forms/pdf-mapping";
import { parseFormDefinition } from "@/lib/forms/schema";

const def = (fields: { id: string; label: string }[], pageId = "p1") =>
  parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: pageId, title: "", fields: fields.map((f) => ({ ...f, type: "short_text" })) }] }).data!;
const box = (fieldId: string, page: number) => ({ id: `s-${fieldId}`, fieldId, kind: "text", page, x: 0, y: 0, width: 10, height: 10 }) as PdfStamp;
const A4 = { width: 595, height: 842 };

describe("joining forms into one (iForms kit)", () => {
  it("keeps every field, renames clashing ids and moves the boxes to the right document page", () => {
    const r = combineForms("קליטה", [
      { definition: def([{ id: "name", label: "שם" }, { id: "id_number", label: "ת\"ז" }]), stamps: [box("name", 0), box("id_number", 1)], pages: [A4, A4] },
      { definition: def([{ id: "name", label: "שם" }, { id: "bank", label: "בנק" }]), stamps: [box("name", 0), box("bank", 0)], pages: [A4] },
    ]);
    expect(r.definition.title).toBe("קליטה");
    expect(r.definition.pages.map((p) => p.id)).toEqual(["p1", "p1_2"]);
    expect(r.definition.pages.flatMap((p) => p.fields.map((f) => f.id))).toEqual(["name", "id_number", "name_2", "bank"]);
    expect(r.pages).toHaveLength(3);
    expect(r.stamps.map((s) => [s.fieldId, s.page])).toEqual([["name", 0], ["id_number", 1], ["name_2", 2], ["bank", 2]]);
    expect(new Set(r.stamps.map((s) => s.id)).size).toBe(4);
    expect(parseFormDefinition(r.definition).success).toBe(true);
  });
});
