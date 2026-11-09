import { describe, expect, it } from "vitest";
import { TODAY_FIELD, comparesToday, describeExpiryRule, hasStepExpiry, normalizeExpiryRows, requestExpiryRule, stepRowRule, withLegacyExpiryRows, withoutStepExpiry, expiryRuleFields, endOfDayIsrael, expiryFor, linkExpiryOf, MIN_STEP_LINK_DAYS, normalizeExpiryRule, stepExpiryRule, stepLinkDeadline } from "@/lib/requests/expiry";

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

describe("old step rules keep counting from the step's start", () => {
  const sentAt = new Date("2026-11-01T08:00:00Z");
  const start = new Date("2026-11-21T08:00:00Z");
  it("an old 7-day step rule is 7 days from the step's start, not from sending", () => {
    const rule = stepExpiryRule({ expiry: { kind: "days", days: 7 } }, null)!;
    expect(rule).toEqual({ kind: "calc", base: { from: "stepStart" }, addDays: 7 });
    expect(stepLinkDeadline(rule, {}, start, sentAt)).toEqual(new Date(start.getTime() + 7 * 86_400_000));
  });
  it("a date rule with the date missing falls back from the step's start", () => {
    const rule = { kind: "calc" as const, base: { from: "field" as const, fieldId: "start" }, snap: { day: 7, mode: "next" as const }, fallbackDays: 30 };
    expect(stepLinkDeadline(rule, {}, start, sentAt)).toEqual(new Date(start.getTime() + 30 * 86_400_000));
  });
});

describe("snap to a day of the same month", () => {
  it("the 5th of the date's month, even when the date is later in it", () => {
    const rule = { kind: "calc" as const, base: { from: "field" as const, fieldId: "d" }, snap: { day: 5, mode: "same" as const } };
    expect(expiryFor(rule, { d: "2026-11-20" }, new Date("2026-11-01T08:00:00Z"))).toEqual(endOfDayIsrael(2026, 11, 5));
    expect(normalizeExpiryRule(rule)).toEqual(rule);
  });
  it("day 31 is the last day of the month", () => {
    const rule = { kind: "calc" as const, base: { from: "field" as const, fieldId: "d" }, snap: { day: 31, mode: "same" as const } };
    expect(expiryFor(rule, { d: "2027-02-10" }, new Date("2027-02-01T08:00:00Z"))).toEqual(endOfDayIsrael(2027, 2, 28));
  });
});

describe("conditions choose the rule", () => {
  const sent = new Date("2026-11-10T08:00:00Z");
  const day = (op: "lte" | "gt", d: number) => ({ type: "day" as const, fieldId: "start", op, day: d });
  // Make's Shivat Zion rule, written with conditions: start day ≤ 20 → the 20th of that month, else of the next.
  const shivat = {
    kind: "cases" as const,
    cases: [{ when: day("lte", 20), then: { kind: "calc" as const, base: { from: "field" as const, fieldId: "start" }, snap: { day: 20, mode: "same" as const } } }],
    otherwise: { kind: "calc" as const, base: { from: "field" as const, fieldId: "start" }, snap: { day: 20, mode: "next" as const } },
  };
  it("the first condition that holds decides, else the otherwise rule", () => {
    expect(expiryFor(shivat, { start: "2026-12-15" }, sent)).toEqual(endOfDayIsrael(2026, 12, 20));
    expect(expiryFor(shivat, { start: "2026-12-25" }, sent)).toEqual(endOfDayIsrael(2027, 1, 20));
    expect(normalizeExpiryRule(shivat)).toEqual(shivat);
  });
  it("a condition on a missing date does not hold", () => {
    expect(expiryFor(shivat, {}, sent)).toEqual(new Date(sent.getTime() + 30 * 86_400_000));
  });
  it("compares a date with the day the link is set", () => {
    const rule = {
      kind: "cases" as const,
      cases: [
        { when: { type: "today" as const, fieldId: "start", op: "past" as const }, then: { kind: "calc" as const, base: { from: "sent" as const }, addDays: 7 } },
        { when: { type: "today" as const, fieldId: "start", op: "within" as const, days: 10 }, then: { kind: "none" as const } },
      ],
      otherwise: { kind: "calc" as const, base: { from: "field" as const, fieldId: "start" }, snap: { day: 7, mode: "next" as const } },
    };
    expect(expiryFor(rule, { start: "2026-11-01" }, sent)).toEqual(new Date(sent.getTime() + 7 * 86_400_000));
    expect(expiryFor(rule, { start: "2026-11-15" }, sent)).toBeNull();
    expect(expiryFor(rule, { start: "2027-01-03" }, sent)).toEqual(endOfDayIsrael(2027, 2, 7));
    expect(describeExpiryRule(rule, () => "תאריך תחילה")).toBe('אם "תאריך תחילה" כבר עבר: 7 ימים מהשליחה; אם "תאריך תחילה" בתוך 10 ימים: ללא תוקף; אחרת: ה-7 בחודש שאחרי "תאריך תחילה"');
    expect(expiryRuleFields(rule)).toEqual(["start"]);
  });
  it("an incomplete condition is not a rule", () => {
    expect(normalizeExpiryRule({ ...shivat, cases: [{ when: { type: "day", fieldId: "", op: "lte", day: 20 }, then: shivat.otherwise }] })).toBeNull();
  });
});

describe("today is the current day", () => {
  const rule = {
    kind: "cases" as const,
    cases: [{ when: { type: "today" as const, fieldId: "start", op: "past" as const }, then: { kind: "none" as const } }],
    otherwise: { kind: "calc" as const, base: { from: "sent" as const }, addDays: 30 },
  };
  it("the same rule gives another deadline on another day", () => {
    const sent = new Date("2026-11-08T08:00:00Z");
    expect(expiryFor(rule, { start: "2026-11-10" }, { sent, today: sent })).toEqual(new Date(sent.getTime() + 30 * 86_400_000));
    expect(expiryFor(rule, { start: "2026-11-10" }, { sent, today: new Date("2026-11-11T08:00:00Z") })).toBeNull();
    expect(comparesToday(rule)).toBe(true);
    expect(comparesToday(rule.otherwise)).toBe(false);
  });
});

describe("the table of rules", () => {
  const form = { kind: "calc" as const, base: { from: "sent" as const }, addDays: 14 };
  const r = (stepRole: string | undefined, orgId: string | undefined, days: number) => ({ id: `${stepRole}-${orgId}`, ...(stepRole ? { stepRole } : {}), ...(orgId ? { orgId } : {}), rule: { kind: "calc" as const, base: { from: "sent" as const }, addDays: days } });
  const rows = [r("approver", undefined, 5), r("approver", "org-a", 6), r(undefined, "org-a", 20)];
  it("the most specific rule applies", () => {
    expect(stepRowRule(rows, "approver", "org-a")).toEqual(rows[1]!.rule);
    expect(stepRowRule(rows, "approver", "org-b")).toEqual(rows[0]!.rule);
    expect(stepRowRule(rows, "employee", "org-a")).toBeNull();
    expect(requestExpiryRule(form, rows, "org-a")).toEqual(rows[2]!.rule);
    expect(requestExpiryRule(form, rows, "org-b")).toEqual(form);
    expect(requestExpiryRule(null, [], null)).toBeNull();
  });
  it("drops rows without a scope or a valid rule, and a second row for a scope", () => {
    expect(normalizeExpiryRows([{ id: "x", rule: form }, { id: "y", stepRole: "a", rule: { kind: "bad" } }, r("a", undefined, 1), r("a", undefined, 2)])).toEqual([r("a", undefined, 1)]);
  });
  it("takes in the rules older forms kept on their steps, after the table's own", () => {
    const workflow = { steps: [
      { role: "requester", expiry: { kind: "none" } },
      { role: "approver", expiry: { kind: "days", days: 4 }, expiryByOrg: { "org-a": { kind: "none" } } },
    ] };
    const out = withLegacyExpiryRows([r("approver", "org-a", 9)], workflow, { "org-b": { steps: [{ role: "manager", expiry: { kind: "none" } }] } });
    expect(out.map((x) => [x.stepRole, x.orgId ?? null, x.rule.kind])).toEqual([["approver", "org-a", "calc"], ["approver", null, "calc"], ["manager", "org-b", "none"]]);
    expect(out[1]!.rule).toEqual({ kind: "calc", base: { from: "stepStart" }, addDays: 4 });
    expect(withoutStepExpiry(workflow).steps[1]).toEqual({ role: "approver" });
  });
});

describe("older forms' rules move with their steps", () => {
  const rule = (days: number) => ({ kind: "days", days });
  it("steps that shared a role keep their own rules under the roles they get now", () => {
    const workflow = { steps: [{ role: "requester" }, { role: "approver", expiry: rule(3) }, { role: "approver", expiry: rule(8) }] };
    const out = withLegacyExpiryRows([], workflow, null, (i) => ["requester", "approver", "approver_2"][i]);
    expect(out.map((r) => [r.stepRole, (r.rule as { addDays?: number }).addDays])).toEqual([["approver", 3], ["approver_2", 8]]);
    expect(hasStepExpiry(workflow, null)).toBe(true);
    expect(hasStepExpiry(withoutStepExpiry(workflow), {})).toBe(false);
  });
  it("a project's route rule is found for requests of that project", () => {
    const rows = [{ id: "p", stepRole: "approver", orgId: "proj", rule: { kind: "none" as const } }];
    expect(stepRowRule(rows, "approver", "org", "proj")).toEqual({ kind: "none" });
    expect(stepRowRule(rows, "approver", "org", null)).toBeNull();
  });
});

describe("a condition on today's date", () => {
  const rule = {
    kind: "cases" as const,
    cases: [{ when: { type: "day" as const, fieldId: TODAY_FIELD, op: "lte" as const, day: 20 }, then: { kind: "calc" as const, base: { from: "sent" as const }, snap: { day: 20, mode: "same" as const } } }],
    otherwise: { kind: "calc" as const, base: { from: "sent" as const }, snap: { day: 20, mode: "next" as const } },
  };
  it("needs no field, and is worked out again as the days pass", () => {
    const sent = new Date("2026-11-08T08:00:00Z");
    expect(expiryFor(rule, {}, sent)).toEqual(endOfDayIsrael(2026, 11, 20));
    expect(expiryFor(rule, {}, { sent, today: new Date("2026-11-25T08:00:00Z") })).toEqual(endOfDayIsrael(2026, 12, 20));
    expect(expiryRuleFields(rule)).toEqual([]);
    expect(comparesToday(rule)).toBe(true);
    expect(describeExpiryRule(rule)).toBe("אם התאריך הנוכחי עד 20 בחודש: ה-20 באותו חודש של השליחה; אחרת: ה-20 בחודש שאחרי השליחה");
  });
});
