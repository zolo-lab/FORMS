import { describe, expect, it } from "vitest";
import { renameOrgFieldInDefinition } from "@/lib/orgs/rename-prefill";
import { ORG_FIELD_PREFIX } from "@/lib/forms/prefill";
import type { FormDefinition } from "@/lib/forms/schema";

const def = (prefill: string): FormDefinition =>
  ({
    schemaVersion: 1,
    title: "101",
    pages: [
      {
        id: "p1",
        title: "",
        fields: [
          { id: "tik", type: "short_text", label: "תיק ניכויים", prefill },
          { id: "name", type: "short_text", label: "שם", prefill: "employee.name" },
          { id: "g", type: "group", label: "קבוצה", fields: [{ id: "inner", type: "short_text", label: "פנימי", prefill }] },
        ],
      },
    ],
  }) as unknown as FormDefinition;

describe("renaming an organization field inside a form", () => {
  it("moves every field that points at the old key, however deep", () => {
    const out = renameOrgFieldInDefinition(def(`${ORG_FIELD_PREFIX}old`), "old", "new")!;
    const page = out.pages[0]!;
    expect(page.fields[0]!.prefill).toBe(`${ORG_FIELD_PREFIX}new`);
    expect((page.fields[2] as { fields: { prefill?: string }[] }).fields[0]!.prefill).toBe(`${ORG_FIELD_PREFIX}new`);
  });

  it("leaves the other prefills alone", () => {
    const out = renameOrgFieldInDefinition(def(`${ORG_FIELD_PREFIX}old`), "old", "new")!;
    expect(out.pages[0]!.fields[1]!.prefill).toBe("employee.name");
  });

  it("says nothing changed when the form points at the old key nowhere", () => {
    expect(renameOrgFieldInDefinition(def("employee.name"), "old", "new")).toBe(null);
    expect(renameOrgFieldInDefinition(def(`${ORG_FIELD_PREFIX}other`), "old", "new")).toBe(null);
  });

  it("does not touch a key that merely starts the same", () => {
    const out = renameOrgFieldInDefinition(def(`${ORG_FIELD_PREFIX}oldish`), "old", "new");
    expect(out).toBe(null);
  });

  it("leaves the definition it was given untouched", () => {
    const original = def(`${ORG_FIELD_PREFIX}old`);
    renameOrgFieldInDefinition(original, "old", "new");
    expect(original.pages[0]!.fields[0]!.prefill).toBe(`${ORG_FIELD_PREFIX}old`);
  });
});
