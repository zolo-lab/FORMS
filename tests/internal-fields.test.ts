import { describe, expect, it } from "vitest";
import { internalFieldIds, omitInternalAnswers, stripInternalFields, stripInternalStamps } from "@/lib/forms/internal";
import { mergedDefinitionForStep } from "@/lib/forms/merge";
import { allFields, formDefinitionSchema, type FormDefinition } from "@/lib/forms/schema";
import { validateAnswers } from "@/lib/forms/validate";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";

const def: FormDefinition = {
  schemaVersion: 1,
  title: "שינוי תנאים",
  pages: [
    { id: "p1", title: "בקשה", fields: [
      { id: "fname", type: "short_text", label: "שם", filledBy: "requester", required: true },
      { id: "cost_center", type: "short_text", label: "מרכז רווח", filledBy: "requester", internal: true, required: true },
    ] },
    { id: "p2", title: "פנימי", fields: [{ id: "department", type: "short_text", label: "מחלקה", filledBy: "requester", internal: true }] },
    { id: "p3", title: "עובד", fields: [{ id: "sig", type: "short_text", label: "אישור", required: true }] },
  ],
};

describe("internal (staff-only) fields", () => {
  it("collects ids and strips them, dropping empty pages", () => {
    expect([...internalFieldIds(def)].sort()).toEqual(["cost_center", "department"]);
    const s = stripInternalFields(def);
    expect(allFields(s).map((f) => f.id)).toEqual(["fname", "sig"]);
    expect(s.pages.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(formDefinitionSchema.safeParse(s).success).toBe(true);
  });
  it("is a valid field property", () => {
    expect(formDefinitionSchema.safeParse(def).success).toBe(true);
  });
  it("the requester sees them; every other role does not", () => {
    const docs = [{ title: "שינוי תנאים", definition: def }];
    expect(allFields(mergedDefinitionForStep(docs, "requester")).some((f) => f.id === "cost_center")).toBe(true);
    for (const role of ["employee", "approver", "payroll", "hr"] as const) {
      expect(allFields(mergedDefinitionForStep(docs, role)).some((f) => f.internal)).toBe(false);
    }
  });
  it("answers and PDF stamps of internal fields are removed", () => {
    const ids = internalFieldIds(def);
    expect(omitInternalAnswers({ fname: "דנה", cost_center: "2001", department: "ת\"ת" }, ids)).toEqual({ fname: "דנה" });
    const mapping: PdfMapping = { stamps: [
      { id: "a", page: 0, x: 1, y: 1, width: 10, height: 10, fieldId: "fname", kind: "text" },
      { id: "b", page: 0, x: 1, y: 1, width: 10, height: 10, fieldId: "cost_center", kind: "text" },
    ] } as PdfMapping;
    expect(stripInternalStamps(mapping, ids).stamps.map((s) => s.fieldId)).toEqual(["fname"]);
  });
  it("validation for the requester still requires them", () => {
    const r = validateAnswers(def, { fname: "דנה" }, { role: "requester" });
    expect(r.errors.cost_center).toBeTruthy();
  });
});
