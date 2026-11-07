import { describe, expect, it } from "vitest";
import { describeExpiryRule, endOfDayIsrael, expiryFor, linkExpiryOf, MIN_STEP_LINK_DAYS, normalizeExpiryRule, stepExpiryRule, stepLinkDeadline } from "@/lib/requests/expiry";

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

describe("dayOfMonth: the Nth on or after the date (Make's Shivat Zion rule: the 20th)", () => {
  const rule = { kind: "dayOfMonth" as const, day: 20, dateFieldId: "start" };
  it("a start on or before the 20th expires on the 20th of the same month", () => {
    expect(expiryFor(rule, { start: "2026-11-05" }, sent)).toEqual(endOfDayIsrael(2026, 11, 20));
    expect(expiryFor(rule, { start: "2026-11-20" }, sent)).toEqual(endOfDayIsrael(2026, 11, 20));
  });
  it("a start after the 20th expires on the 20th of the next month", () => {
    expect(expiryFor(rule, { start: "2026-11-21" }, sent)).toEqual(endOfDayIsrael(2026, 12, 20));
    expect(expiryFor(rule, { start: "21/12/2026" }, sent)).toEqual(endOfDayIsrael(2027, 1, 20));
  });
  it("without a date falls back to days after sending", () => {
    expect(expiryFor({ ...rule, fallbackDays: 5 }, {}, sent)).toEqual(new Date(sent.getTime() + 5 * 86_400_000));
  });
  it("normalizes and describes", () => {
    expect(normalizeExpiryRule({ kind: "dayOfMonth", day: 20, dateFieldId: "start" })).toEqual(rule);
    expect(normalizeExpiryRule({ kind: "dayOfMonth", day: 20 })).toBeNull();
    expect(describeExpiryRule(rule, () => "תאריך תחילה")).toBe('ה-20 בחודש לפי "תאריך תחילה" (אותו חודש עד ה-20, אחרת החודש הבא)');
  });
});

describe("linkExpiryOf: a step's own deadline wins over the request's", () => {
  const req = { expiresAt: new Date("2026-12-01T00:00:00Z") };
  it("a step without its own rule uses the request's", () => {
    expect(linkExpiryOf({ ownLinkExpiry: false, linkExpiresAt: null }, req)).toEqual(req.expiresAt);
  });
  it("a step with its own rule uses its own date, or none", () => {
    const own = new Date("2026-11-20T21:59:00Z");
    expect(linkExpiryOf({ ownLinkExpiry: true, linkExpiresAt: own }, req)).toEqual(own);
    expect(linkExpiryOf({ ownLinkExpiry: true, linkExpiresAt: null }, req)).toBeNull();
  });
});

describe("stepExpiryRule: the organization's exception wins", () => {
  const step = { expiry: { kind: "dayOfNextMonth" as const, day: 7, dateFieldId: "start" }, expiryByOrg: { "org-sz": { kind: "dayOfMonth" as const, day: 20, dateFieldId: "start" } } };
  it("picks the exception for its organization, the step rule otherwise", () => {
    expect(stepExpiryRule(step, "org-sz")).toEqual(step.expiryByOrg["org-sz"]);
    expect(stepExpiryRule(step, "org-other")).toEqual(step.expiry);
    expect(stepExpiryRule({}, "org-sz")).toBeNull();
  });
});

describe("stepLinkDeadline: never dead on arrival", () => {
  const rule = { kind: "dayOfNextMonth" as const, day: 7, dateFieldId: "start" };
  it("keeps the rule's date when it is far enough", () => {
    expect(stepLinkDeadline(rule, { start: "2026-10-15" }, sent)).toEqual(endOfDayIsrael(2026, 11, 7));
  });
  it("a start date long past still leaves the link open for a few days", () => {
    expect(stepLinkDeadline(rule, { start: "2026-01-15" }, sent)).toEqual(new Date(sent.getTime() + MIN_STEP_LINK_DAYS * 86_400_000));
  });
  it("none stays none", () => {
    expect(stepLinkDeadline({ kind: "none" }, {}, sent)).toBeNull();
  });
});
