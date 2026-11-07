import { describe, expect, it } from "vitest";
import { keyFromLabel, normalizeFieldKey, suggestKey } from "@/lib/fields/key";

describe("keyFromLabel", () => {
  it("translates common names", () => {
    expect(keyFromLabel("שם פרטי")).toBe("firstName");
    expect(keyFromLabel('ח"פ')).toBe("companyNumber");
    expect(keyFromLabel("ח.פ.")).toBe("companyNumber");
    expect(keyFromLabel("  תעודת  זהות ")).toBe("idNumber");
    expect(keyFromLabel("מספר תיק ניכויים")).toBe("deductionsFile");
  });

  it("transliterates the rest into snake_case", () => {
    expect(keyFromLabel("שם החווה")).toBe("shmHchvvh");
    expect(keyFromLabel("סוג הלינה")).toBe("svgHlynh");
  });

  it("keeps English and digits, starts with a letter", () => {
    expect(keyFromLabel("Supplier Code")).toBe("supplierCode");
    expect(keyFromLabel("101 טופס")).toBe("f101Tvps");
    expect(keyFromLabel("!!!")).toBe("field");
  });

  it("caps the length", () => {
    expect(keyFromLabel("א".repeat(60)).length).toBeLessThanOrEqual(40);
  });
});

describe("suggestKey", () => {
  it("adds a number when the name is taken (case-insensitive)", () => {
    expect(suggestKey("שם ספק", [])).toBe("supplierName");
    expect(suggestKey("שם ספק", ["SupplierName"])).toBe("supplierName2");
    expect(suggestKey("שם ספק", ["supplierName", "supplierName2"])).toBe("supplierName3");
  });
});

describe("normalizeFieldKey", () => {
  it("accepts ASCII identifiers only", () => {
    expect(normalizeFieldKey(" deductions_file ")).toBe("deductions_file");
    expect(normalizeFieldKey("1abc")).toBeNull();
    expect(normalizeFieldKey("with-hyphen")).toBeNull();
    expect(normalizeFieldKey("שם")).toBeNull();
    expect(normalizeFieldKey("")).toBeNull();
  });
});
