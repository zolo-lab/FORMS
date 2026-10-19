import { describe, expect, it } from "vitest";
import { canSendReminderNow, isQuietHour, isShabbat, reminderDue } from "@/lib/workflow/reminders";
import { DEFAULT_REMINDER_POLICY as P } from "@/lib/workflow/types";

// Israel is UTC+3 in summer time (October 14, 2026 is a Wednesday, DST ends Oct 25).
const il = (iso: string) => new Date(`${iso}+03:00`);

describe("quiet hours and Shabbat", () => {
  it("quiet 21:00-08:00 crosses midnight", () => {
    expect(isQuietHour(il("2026-10-14T21:00:00"), P)).toBe(true);
    expect(isQuietHour(il("2026-10-14T03:00:00"), P)).toBe(true);
    expect(isQuietHour(il("2026-10-14T08:00:00"), P)).toBe(false);
    expect(isQuietHour(il("2026-10-14T20:59:00"), P)).toBe(false);
  });
  it("a same-day quiet window works too", () => {
    const w = { quietFromHour: 12, quietToHour: 14 };
    expect(isQuietHour(il("2026-10-14T13:00:00"), w)).toBe(true);
    expect(isQuietHour(il("2026-10-14T14:00:00"), w)).toBe(false);
  });
  it("Shabbat runs from Friday 15:00 to Saturday 21:00", () => {
    expect(isShabbat(il("2026-10-16T14:59:00"))).toBe(false); // Friday
    expect(isShabbat(il("2026-10-16T15:00:00"))).toBe(true);
    expect(isShabbat(il("2026-10-17T12:00:00"))).toBe(true); // Saturday
    expect(isShabbat(il("2026-10-17T21:00:00"))).toBe(false);
    expect(isShabbat(il("2026-10-14T12:00:00"))).toBe(false); // Wednesday
  });
  it("skipShabbat can be turned off", () => {
    const noon = il("2026-10-17T12:00:00");
    expect(canSendReminderNow(noon, P)).toBe(false);
    expect(canSendReminderNow(noon, { ...P, skipShabbat: false })).toBe(true);
  });
});

describe("reminderDue with a fake clock", () => {
  const activatedAt = il("2026-10-11T09:00:00"); // Sunday morning
  it("sends exactly maxCount reminders, spaced by firstAfterHours then everyHours", () => {
    const policy = { ...P, firstAfterHours: 24, everyHours: 48, maxCount: 3, skipShabbat: false };
    let sent = 0;
    let last: Date | null = null;
    const log: string[] = [];
    // Tick every 30 minutes for 14 days.
    for (let t = activatedAt.getTime(); t < activatedAt.getTime() + 14 * 86_400_000; t += 30 * 60_000) {
      const now = new Date(t);
      if (reminderDue({ activatedAt, sent, lastSentAt: last }, policy, now)) {
        sent++;
        last = now;
        log.push(now.toISOString());
      }
    }
    expect(sent).toBe(policy.maxCount);
    // First one: 24 h after activation, at the first allowed tick (Monday 09:00 Israel time).
    expect(new Date(log[0]!).getTime()).toBe(activatedAt.getTime() + 24 * 3_600_000);
    expect(new Date(log[1]!).getTime() - new Date(log[0]!).getTime()).toBeGreaterThanOrEqual(48 * 3_600_000);
  });
  it("sends nothing during Shabbat", () => {
    const start = il("2026-10-16T09:00:00"); // Friday 09:00
    let sent = 0;
    let last: Date | null = null;
    for (let t = start.getTime(); t < start.getTime() + 3 * 86_400_000; t += 15 * 60_000) {
      const now = new Date(t);
      if (reminderDue({ activatedAt: start, sent, lastSentAt: last }, { ...P, firstAfterHours: 1, everyHours: 1, maxCount: 50 }, now)) {
        expect(isShabbat(now)).toBe(false);
        expect(isQuietHour(now, P)).toBe(false);
        sent++;
        last = now;
      }
    }
    expect(sent).toBeGreaterThan(0);
  });
  it("never before the first delay", () => {
    expect(reminderDue({ activatedAt, sent: 0, lastSentAt: null }, P, il("2026-10-12T08:59:00"))).toBe(false);
  });
});

describe("unlimited reminders (maxCount 0)", () => {
  it("keeps reminding every interval until the step ends", () => {
    const start = new Date("2026-10-11T06:00:00Z");
    const policy = { ...P, firstAfterHours: 72, everyHours: 72, maxCount: 0, quietFromHour: 0, quietToHour: 0, skipShabbat: false };
    let sent = 0;
    let last: Date | null = null;
    for (let t = start.getTime(); t < start.getTime() + 30 * 86_400_000; t += 3_600_000) {
      const now = new Date(t);
      if (reminderDue({ activatedAt: start, sent, lastSentAt: last }, policy, now)) { sent++; last = now; }
    }
    expect(sent).toBe(9);
  });
  it("the default is every 3 days with no cap", () => {
    expect(P).toMatchObject({ firstAfterHours: 72, everyHours: 72, maxCount: 0 });
  });
});
