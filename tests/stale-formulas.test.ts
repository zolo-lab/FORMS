import { describe, expect, it } from "vitest";
import { staleFormulaValues } from "@/lib/forms/compute";
import type { FormDefinition } from "@/lib/forms/schema";

const full = {
  schemaVersion: 1,
  title: "t",
  settings: { layout: "single" },
  pages: [{ id: "p", title: "", fields: [
    { id: "base", type: "number", label: "b", filledBy: "employee" },
    { id: "bonus", type: "number", label: "x", filledBy: "requester", formula: "{base} * 2" },
  ] }],
} as unknown as FormDefinition;

describe("staleFormulaValues", () => {
  it("returns formulas of other roles that changed with new inputs", () => {
    expect(staleFormulaValues(full, { base: 5, bonus: 2 }, "2026-10-14")).toEqual({ bonus: 10 });
  });
  it("returns nothing when already up to date", () => {
    expect(staleFormulaValues(full, { base: 5, bonus: 10 }, "2026-10-14")).toEqual({});
  });
});
