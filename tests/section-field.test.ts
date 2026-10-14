import { describe, expect, it } from "vitest";
import { FIELD_TYPES, FIELD_TYPE_META } from "@/lib/forms/field-types";
import { parseFormDefinition } from "@/lib/forms/schema";
import { validateAnswers } from "@/lib/forms/validate";

const def = parseFormDefinition({
  schemaVersion: 1,
  title: "t",
  pages: [
    {
      id: "p1",
      title: "",
      fields: [
        { id: "s1", type: "section", label: "פרטי קשר", description: "איך ליצור קשר" },
        { id: "a", type: "short_text", label: "שם", required: true },
      ],
    },
  ],
}).data!;

describe("section field", () => {
  it("is a layout type without an answer", () => {
    expect(FIELD_TYPES).toContain("section");
    expect(FIELD_TYPE_META.section).toMatchObject({ category: "layout", hasAnswer: false });
  });

  it("is not validated and leaves no answer behind", () => {
    const v = validateAnswers(def, { a: "דנה", s1: "x" });
    expect(v.ok).toBe(true);
    expect(v.cleaned).toEqual({ a: "דנה" });
  });
});
