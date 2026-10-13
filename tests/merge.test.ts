import { describe, expect, it } from "vitest";
import { mergedDefinitionForStep, splitAnswers, type PackageDoc } from "@/lib/forms/merge";
import { allFields, formDefinitionSchema, type FormDefinition } from "@/lib/forms/schema";

const doc = (title: string, fields: FormDefinition["pages"][number]["fields"][]): PackageDoc => ({
  title,
  definition: {
    schemaVersion: 1,
    title,
    pages: fields.map((f, i) => ({ id: `p${i + 1}`, title: `עמוד ${i + 1}`, fields: f })),
  },
});

const id = { id: "idNumber", type: "id_number", label: "ת\"ז" } as const;
const docs: PackageDoc[] = [
  doc("טופס 101", [[id, { id: "firstName", type: "short_text", label: "שם" }]]),
  doc("הסכם", [[id, { id: "role", type: "short_text", label: "תפקיד", filledBy: "requester" }]]),
  doc("בנק", [[id], [{ id: "bank", type: "bank_account", label: "בנק" }]]),
];

describe("mergedDefinitionForStep", () => {
  const merged = mergedDefinitionForStep(docs, "employee");
  it("shows a shared field once", () => {
    expect(allFields(merged).filter((f) => f.id === "idNumber")).toHaveLength(1);
  });
  it("is a valid form definition with unique page ids", () => {
    expect(formDefinitionSchema.safeParse(merged).success).toBe(true);
    const ids = merged.pages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("drops pages that became empty and titles pages by document", () => {
    expect(merged.pages.map((p) => p.title)).toEqual(["טופס 101 – עמוד 1", "הסכם – עמוד 1", "בנק – עמוד 2"]);
  });
  it("marks fields of other roles read-only", () => {
    const f = allFields(merged);
    expect(f.find((x) => x.id === "role")!.readOnly).toBe(true);
    expect(f.find((x) => x.id === "firstName")!.readOnly).toBeUndefined();
  });
  it("keeps a single document's titles as-is", () => {
    const m = mergedDefinitionForStep([docs[0]!], "employee");
    expect(m.pages[0]!.title).toBe("עמוד 1");
  });
});

describe("splitAnswers", () => {
  it("spreads one answer to every document that has the field", () => {
    const parts = splitAnswers(docs, { idNumber: "000000018", firstName: "ישראל", role: "מורה", bank: { bank: "10" }, junk: 1 });
    expect(parts[0]).toEqual({ idNumber: "000000018", firstName: "ישראל" });
    expect(parts[1]).toEqual({ idNumber: "000000018", role: "מורה" });
    expect(parts[2]).toEqual({ idNumber: "000000018", bank: { bank: "10" } });
  });
});
