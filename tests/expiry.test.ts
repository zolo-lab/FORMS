import { describe, expect, it } from "vitest";
import { describeExpiryRule, endOfDayIsrael, expiryFor, normalizeExpiryRule } from "@/lib/requests/expiry";

const day = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(d);
const sent = new Date("2026-10-19T08:00:00Z");

describe("expiryFor", () => {
  it("default: 30 days after sending", () => {
    expect(expiryFor(null, {}, sent)!.getTime() - sent.getTime()).toBe(30 * 86_400_000);
  });
  it("days rule", () => {
    expect(day(expiryFor({ kind: "days", days: 7 }, {}, sent)!)).toBe("2026-10-26");
  });
  it("none = no expiry", () => {
    expect(expiryFor({ kind: "none" }, {}, sent)).toBeNull();
  });
  it("4th of the month after the start date", () => {
    const d = expiryFor({ kind: "dayOfNextMonth", day: 4, dateFieldId: "start" }, { start: "2026-11-15" }, sent)!;
    expect(day(d)).toBe("2026-12-04");
    expect(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(d)).toBe("23:59");
  });
  it("December rolls into January", () => {
    expect(day(expiryFor({ kind: "dayOfNextMonth", day: 7, dateFieldId: "start" }, { start: "2026-12-20" }, sent)!)).toBe("2027-01-07");
  });
  it("a day past the end of the month becomes its last day", () => {
    expect(day(expiryFor({ kind: "dayOfNextMonth", day: 31, dateFieldId: "s" }, { s: "2027-01-31" }, sent)!)).toBe("2027-02-28");
    expect(day(expiryFor({ kind: "dayOfNextMonth", day: 31, dateFieldId: "s" }, { s: "2028-01-10" }, sent)!)).toBe("2028-02-29");
  });
  it("accepts dd/mm/yyyy and falls back without a date", () => {
    expect(day(expiryFor({ kind: "dayOfNextMonth", day: 10, dateFieldId: "s" }, { s: "15/03/2027" }, sent)!)).toBe("2027-04-10");
    expect(expiryFor({ kind: "dayOfNextMonth", day: 10, dateFieldId: "s", fallbackDays: 5 }, {}, sent)!.getTime() - sent.getTime()).toBe(5 * 86_400_000);
  });
  it("end of day in summer and winter time", () => {
    expect(endOfDayIsrael(2026, 7, 1).toISOString()).toBe("2026-07-01T20:59:00.000Z");
    expect(endOfDayIsrael(2026, 12, 1).toISOString()).toBe("2026-12-01T21:59:00.000Z");
  });
});

describe("normalizeExpiryRule / describe", () => {
  it("keeps valid rules and drops junk", () => {
    expect(normalizeExpiryRule({ kind: "days", days: "14" })).toEqual({ kind: "days", days: 14 });
    expect(normalizeExpiryRule({ kind: "dayOfNextMonth", day: 40, dateFieldId: "x" })).toEqual({ kind: "dayOfNextMonth", day: 31, dateFieldId: "x" });
    expect(normalizeExpiryRule({ kind: "dayOfNextMonth", day: 4 })).toBeNull();
    expect(normalizeExpiryRule("x")).toBeNull();
    expect(normalizeExpiryRule({ kind: "none" })).toEqual({ kind: "none" });
  });
  it("describes in Hebrew", () => {
    expect(describeExpiryRule({ kind: "dayOfNextMonth", day: 4, dateFieldId: "s" }, () => "תאריך תחילה")).toBe('ה-4 בחודש שאחרי "תאריך תחילה"');
    expect(describeExpiryRule({ kind: "none" })).toBe("ללא תפוגה");
  });
});
