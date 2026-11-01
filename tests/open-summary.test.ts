import { describe, expect, it } from "vitest";
import { describeSchedule, isSummaryDue, openSummaryLines, parseSchedule } from "@/lib/notifications/open-summary";

const form = (o: Record<string, string | string[]>) => [
  (n: string) => (typeof o[n] === "string" ? (o[n] as string) : null),
  (n: string) => (Array.isArray(o[n]) ? (o[n] as string[]) : typeof o[n] === "string" ? [o[n] as string] : []),
] as const;

describe("open requests summary", () => {
  it("is due in the scheduled hour on a scheduled weekday or day of the month (Israel time)", () => {
    const sunday0730 = new Date("2026-11-01T05:30:00Z"); // Sunday 1.11, 07:30 IST
    expect(isSummaryDue({ kind: "weekdays", days: [0, 2], hour: 7 }, sunday0730)).toBe(true);
    expect(isSummaryDue({ kind: "weekdays", days: [1], hour: 7 }, sunday0730)).toBe(false);
    expect(isSummaryDue({ kind: "weekdays", days: [0], hour: 8 }, sunday0730)).toBe(false);
    expect(isSummaryDue({ kind: "monthDays", days: [1, 11], hour: 7 }, sunday0730)).toBe(true);
    // 31.10 23:30 UTC is already 1.11 in Israel.
    expect(isSummaryDue({ kind: "monthDays", days: [1], hour: 1 }, new Date("2026-10-31T23:30:00Z"))).toBe(true);
  });
  it("parses and describes the schedule from the panel", () => {
    const [g1, a1] = form({ scheduleKind: "weekdays", weekday: ["4", "0", "9", "0"], hour: "7" });
    expect(parseSchedule(g1, a1)).toEqual({ kind: "weekdays", days: [0, 4], hour: 7 });
    const [g2, a2] = form({ scheduleKind: "monthDays", monthDays: "29, 2 ,11 40", hour: "21" });
    const s = parseSchedule(g2, a2)!;
    expect(s).toEqual({ kind: "monthDays", days: [2, 11, 29], hour: 21 });
    expect(describeSchedule(s)).toBe("ב-2, 11, 29 בכל חודש ב-21:00");
    expect(describeSchedule({ kind: "weekdays", days: [0, 2, 4], hour: 7 })).toBe("בימים א׳, ג׳, ה׳ ב-07:00");
    const [g3, a3] = form({ scheduleKind: "weekdays", hour: "7" });
    expect(parseSchedule(g3, a3)).toBeNull();
    const [g4, a4] = form({ scheduleKind: "weekdays", weekday: "1", hour: "24" });
    expect(parseSchedule(g4, a4)).toBeNull();
  });
  it("lists every open request, longest waiting first, with how to reach the person", () => {
    const text = openSummaryLines([
      { subject: "א", packageName: "קליטה", waitingFor: "עובד", days: 1, contact: "a@x.co" },
      { subject: "ב", packageName: "סיום", waitingFor: "מאשר", days: 6, contact: "" },
    ]);
    expect(text).toBe("• ב – סיום – ממתין למאשר – 6 ימים\n• א (a@x.co) – קליטה – ממתין לעובד – 1 ימים");
  });
});
