import { describe, expect, it } from "vitest";
import { normalizeIdNumber } from "@/lib/requests/employee";

describe("normalizeIdNumber", () => {
  it("pads Israeli ID numbers and strips separators", () => {
    expect(normalizeIdNumber("12345678")).toBe("012345678");
    expect(normalizeIdNumber(" 123-456-789 ")).toBe("123456789");
  });
  it("keeps passports, drops empties", () => {
    expect(normalizeIdNumber("ab123")).toBe("AB123");
    expect(normalizeIdNumber("")).toBeNull();
    expect(normalizeIdNumber(null)).toBeNull();
  });
});
