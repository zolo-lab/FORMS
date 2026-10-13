import { describe, expect, it } from "vitest";
import { applyMask, matchesMask, maskSlots, stripMask } from "@/lib/forms/mask";

describe("input masks", () => {
  it("formats progressively", () => {
    expect(applyMask("", "999-9999999")).toBe("");
    expect(applyMask("050", "999-9999999")).toBe("050");
    expect(applyMask("0501", "999-9999999")).toBe("050-1");
    expect(applyMask("0501234567", "999-9999999")).toBe("050-1234567");
    expect(applyMask("05012345678999", "999-9999999")).toBe("050-1234567");
  });

  it("stores only the filled slots", () => {
    expect(stripMask("050-1234567", "999-9999999")).toBe("0501234567");
    expect(stripMask("05x0-12 34567", "999-9999999")).toBe("0501234567");
    expect(stripMask("ab12", "99")).toBe("12");
  });

  it("supports letters and wildcards", () => {
    expect(applyMask("דנ12", "aa-99")).toBe("דנ-12");
    expect(stripMask("A1b2", "****")).toBe("A1b2");
    expect(matchesMask("דנ12", "aa99")).toBe(true);
    expect(matchesMask("1234", "aa99")).toBe(false);
  });

  it("validates complete values", () => {
    expect(matchesMask("0501234567", "999-9999999")).toBe(true);
    expect(matchesMask("050123", "999-9999999")).toBe(false);
    expect(maskSlots("999-9999999")).toBe(10);
  });
});
