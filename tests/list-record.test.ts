import { describe, expect, it } from "vitest";
import { cleanRecord, recordTitle, valueProblem, type RecordField } from "@/lib/fields/record";

const fields: RecordField[] = [
  { key: "name", label: "שם", type: "short_text" },
  { key: "num", label: "ח״פ", type: "number" },
  { key: "mail", label: "מייל", type: "email" },
];

describe("list records", () => {
  it("checks values by type; empty is fine", () => {
    expect(valueProblem("number", "1,200.5")).toBeNull();
    expect(valueProblem("number", "abc")).toBe("צריך מספר");
    expect(valueProblem("email", "a@b.co")).toBeNull();
    expect(valueProblem("email", "nope")).toBe("מייל לא תקין");
    expect(valueProblem("id_number", "123456789")).toBeNull();
    expect(valueProblem("id_number", "12a")).not.toBeNull();
    expect(valueProblem("date", "2026-11-08")).toBeNull();
    expect(valueProblem("phone", "050-1234567")).toBeNull();
    expect(valueProblem("short_text", "")).toBeNull();
  });

  it("keeps the type's fields only, trims, reports problems", () => {
    expect(cleanRecord({ name: "  בצלאל  מערכות ", num: "51x", mail: "", other: "z" }, fields)).toEqual({
      values: { name: "בצלאל מערכות" },
      problems: { num: "צריך מספר" },
    });
  });

  it("is known by its display field, else its first value", () => {
    expect(recordTitle({ name: "בצלאל", num: "51" }, fields, "num")).toBe("51");
    expect(recordTitle({ num: "51" }, fields, "name")).toBe("51");
    expect(recordTitle({}, fields, null)).toBe("");
  });
});
