import { describe, expect, it } from "vitest";
import { normalizeHex, orgThemeVars } from "@/lib/branding";
import { parseReminderPolicy } from "@/lib/workflow/reminder-policy";
import { DEFAULT_REMINDER_POLICY } from "@/lib/workflow/types";

describe("branding", () => {
  it("normalizes hex colors", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex(" #1D4ED8 ")).toBe("#1d4ed8");
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
  it("picks a readable foreground", () => {
    expect(orgThemeVars("#1d4ed8")).toEqual({ "--primary": "#1d4ed8", "--primary-foreground": "#ffffff" });
    expect(orgThemeVars("#fde047")!["--primary-foreground"]).toBe("#111111");
  });
  it("returns null for missing or invalid colors", () => {
    expect(orgThemeVars(null)).toBeNull();
    expect(orgThemeVars("nope")).toBeNull();
  });
});

describe("parseReminderPolicy", () => {
  it("parses and clamps form values", () => {
    expect(parseReminderPolicy({ firstAfterHours: "12", everyHours: "24", maxCount: "5", quietFromHour: "22", quietToHour: "7", skipShabbat: "on" })).toEqual({
      firstAfterHours: 12, everyHours: 24, maxCount: 5, quietFromHour: 22, quietToHour: 7, skipShabbat: true,
    });
    const p = parseReminderPolicy({ firstAfterHours: "0", everyHours: "99999", maxCount: "99", quietFromHour: "30", quietToHour: "-1" });
    expect(p).toMatchObject({ firstAfterHours: 1, everyHours: 720, maxCount: 10, quietFromHour: 23, quietToHour: 0, skipShabbat: false });
  });
  it("falls back to defaults for junk", () => {
    expect(parseReminderPolicy({ firstAfterHours: "abc" }).firstAfterHours).toBe(DEFAULT_REMINDER_POLICY.firstAfterHours);
  });
});
