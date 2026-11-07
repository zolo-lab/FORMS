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
    // Older rules read as the general rule.
    expect(normalizeExpiryRule({ kind: "days", days: "14" })).toEqual({ kind: "calc", base: { from: "sent" }, addDays: 14 });
    expect(normalizeExpiryRule({ kind: "dayOfNextMonth", day: 40, dateFieldId: "x" })).toEqual({ kind: "calc", base: { from: "field", fieldId: "x" }, snap: { day: 31, mode: "next" } });
    expect(normalizeExpiryRule({ kind: "dayOfNextMonth", day: 4 })).toBeNull();
    expect(normalizeExpiryRule("x")).toBeNull();
    expect(normalizeExpiryRule({ kind: "none" })).toEqual({ kind: "none" });
  });
  it("describes in Hebrew", () => {
    expect(describeExpiryRule({ kind: "dayOfNextMonth", day: 4, dateFieldId: "s" }, () => "תאריך תחילה")).toBe('ה-4 בחודש שאחרי "תאריך תחילה"');
    expect(describeExpiryRule({ kind: "none" })).toBe("ללא תוקף");
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
    expect(normalizeExpiryRule({ kind: "dayOfMonth", day: 20, dateFieldId: "start" })).toEqual({ kind: "calc", base: { from: "field", fieldId: "start" }, snap: { day: 20, mode: "sameOrNext" } });
    expect(normalizeExpiryRule({ kind: "dayOfMonth", day: 20 })).toBeNull();
    expect(describeExpiryRule(rule, () => "תאריך תחילה")).toBe('ה-20 בחודש לפי "תאריך תחילה" (אותו חודש אם לא עבר, אחרת הבא)');
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
    expect(stepExpiryRule(step, "org-sz")).toEqual({ kind: "calc", base: { from: "field", fieldId: "start" }, snap: { day: 20, mode: "sameOrNext" } });
    expect(stepExpiryRule(step, "org-other")).toEqual({ kind: "calc", base: { from: "field", fieldId: "start" }, snap: { day: 7, mode: "next" } });
    expect(stepExpiryRule({}, "org-sz")).toBeNull();
  });
});

describe("stepLinkDeadline: never dead on arrival", () => {
  const rule = { kind: "calc" as const, base: { from: "field" as const, fieldId: "start" }, snap: { day: 7, mode: "next" as const } };
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

describe("the general rule (start → add → round)", () => {
  const sentAt = new Date("2026-11-03T08:00:00Z");
  const field = (fieldId: string) => ({ from: "field" as const, fieldId });
  it("Make's presets: the 7th / 10th of the month after the start date, the 20th this month or the next", () => {
    expect(expiryFor({ kind: "calc", base: field("start"), snap: { day: 7, mode: "next" } }, { start: "2026-11-15" }, sentAt)).toEqual(endOfDayIsrael(2026, 12, 7));
    expect(expiryFor({ kind: "calc", base: field("start"), snap: { day: 10, mode: "next" } }, { start: "2026-11-15" }, sentAt)).toEqual(endOfDayIsrael(2026, 12, 10));
    expect(expiryFor({ kind: "calc", base: field("start"), snap: { day: 20, mode: "sameOrNext" } }, { start: "2026-11-15" }, sentAt)).toEqual(endOfDayIsrael(2026, 11, 20));
    expect(expiryFor({ kind: "calc", base: field("start"), snap: { day: 20, mode: "sameOrNext" } }, { start: "2026-11-25" }, sentAt)).toEqual(endOfDayIsrael(2026, 12, 20));
  });
  it("adds months and days before rounding", () => {
    // 15.11 + 1 month = 15.12 → the 1st of the month after = 1.1.2027
    expect(expiryFor({ kind: "calc", base: field("start"), addMonths: 1, snap: { day: 1, mode: "next" } }, { start: "2026-11-15" }, sentAt)).toEqual(endOfDayIsrael(2027, 1, 1));
    // 31.1 + 1 month = 28.2 (no 31st)
    expect(expiryFor({ kind: "calc", base: field("start"), addMonths: 1 }, { start: "2027-01-31" }, sentAt)).toEqual(endOfDayIsrael(2027, 2, 28));
    expect(expiryFor({ kind: "calc", base: field("start"), addDays: 14 }, { start: "2026-12-25" }, sentAt)).toEqual(endOfDayIsrael(2027, 1, 8));
  });
  it("from sending: N days keeps the time; with rounding, the end of that day", () => {
    expect(expiryFor({ kind: "calc", base: { from: "sent" }, addDays: 30 }, {}, sentAt)).toEqual(new Date(sentAt.getTime() + 30 * 86_400_000));
    expect(expiryFor({ kind: "calc", base: { from: "sent" }, snap: { day: 7, mode: "next" } }, {}, sentAt)).toEqual(endOfDayIsrael(2026, 12, 7));
  });
  it("from the step's start uses the step's moment, not the sending", () => {
    const start = new Date("2026-11-20T08:00:00Z");
    expect(expiryFor({ kind: "calc", base: { from: "stepStart" }, addDays: 5 }, {}, { sent: sentAt, start })).toEqual(new Date(start.getTime() + 5 * 86_400_000));
  });
  it("rejects a rule that would expire at once, and describes rules as sentences", () => {
    expect(normalizeExpiryRule({ kind: "calc", base: { from: "sent" } })).toBeNull();
    expect(describeExpiryRule({ kind: "calc", base: { from: "sent" }, addDays: 30 })).toBe("30 ימים מהשליחה");
    expect(describeExpiryRule({ kind: "calc", base: field("s"), snap: { day: 7, mode: "next" } }, () => "תאריך תחילה")).toBe('ה-7 בחודש שאחרי "תאריך תחילה"');
    expect(describeExpiryRule({ kind: "calc", base: field("s"), addMonths: 1, snap: { day: 1, mode: "next" } }, () => "תאריך תחילה")).toBe('ה-1 בחודש שאחרי חודש אחרי "תאריך תחילה"');
  });
});
