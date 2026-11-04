import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDER_POLICY } from "@/lib/workflow/types";
import { EMPTY_PREFS, effectiveReminderPolicy, groupOfTrigger, normalizePrefs, remindersEnabledFor, wantsMessage, type UserNotificationPrefs } from "@/lib/notifications/user-prefs";

const prefs = (p: Partial<UserNotificationPrefs>): UserNotificationPrefs => ({ ...EMPTY_PREFS, ...p });

describe("groupOfTrigger", () => {
  it("maps the triggers people care about", () => {
    expect(groupOfTrigger("step_invite")).toBe("my_turn");
    expect(groupOfTrigger("returned")).toBe("my_turn");
    expect(groupOfTrigger("reminder")).toBe("reminder");
    expect(groupOfTrigger("step_done")).toBe("progress");
    expect(groupOfTrigger("completion_docs")).toBe("finished");
    expect(groupOfTrigger("weekly_digest")).toBe("summaries");
  });

  it("leaves sign-in codes out of the personal settings", () => {
    expect(groupOfTrigger("otp")).toBeNull();
  });
});

describe("wantsMessage", () => {
  it("without a setting, keeps what the level below decided", () => {
    expect(wantsMessage(undefined, "reminder", "email", true)).toBe(true);
    expect(wantsMessage(undefined, "reminder", "email", false)).toBe(false);
    expect(wantsMessage(EMPTY_PREFS, "step_done", "sms", true)).toBe(true);
  });

  it("a personal switch beats the form's setting in both directions", () => {
    const off = prefs({ groups: { reminder: { enabled: false } } });
    const on = prefs({ groups: { reminder: { enabled: true } } });
    expect(wantsMessage(off, "reminder", "email", true)).toBe(false);
    expect(wantsMessage(on, "reminder", "email", false)).toBe(true);
  });

  it("drops one channel and keeps the other", () => {
    const p = prefs({ groups: { progress: { sms: false } } });
    expect(wantsMessage(p, "step_done", "sms")).toBe(false);
    expect(wantsMessage(p, "step_done", "email")).toBe(true);
  });

  it("never lets anyone switch off the invitation to sign", () => {
    const p = normalizePrefs({ groups: { my_turn: { enabled: false, email: false, sms: false } } });
    expect(wantsMessage(p, "step_invite", "email")).toBe(true);
  });

  it("does not touch sign-in codes", () => {
    const p = prefs({ groups: { my_turn: { sms: false } } });
    expect(wantsMessage(p, "otp", "sms")).toBe(true);
  });

  it("a setting on one group leaves the others alone", () => {
    const p = prefs({ groups: { summaries: { enabled: false } } });
    expect(wantsMessage(p, "weekly_digest", "email")).toBe(false);
    expect(wantsMessage(p, "completed", "email")).toBe(true);
  });
});

describe("normalizePrefs", () => {
  it("survives junk", () => {
    expect(normalizePrefs(null)).toEqual(EMPTY_PREFS);
    expect(normalizePrefs({ groups: { nope: { enabled: false } }, reminderTiming: { firstAfterHours: "soon" } })).toEqual(EMPTY_PREFS);
  });

  it("keeps only real choices", () => {
    expect(normalizePrefs({ groups: { reminder: { enabled: false, email: undefined } } })).toEqual({ groups: { reminder: { enabled: false, email: undefined, sms: undefined } }, reminderTiming: {} });
  });

  it("rejects hours out of range and a zero interval", () => {
    expect(normalizePrefs({ reminderTiming: { quietFromHour: 25, everyHours: 0, maxCount: 3 } }).reminderTiming).toEqual({ everyHours: 1, maxCount: 3 });
  });
});

describe("effectiveReminderPolicy", () => {
  it("falls back to the organization, then to the code", () => {
    expect(effectiveReminderPolicy(null, undefined)).toEqual(DEFAULT_REMINDER_POLICY);
    const org = { ...DEFAULT_REMINDER_POLICY, firstAfterHours: 24 };
    expect(effectiveReminderPolicy(org, EMPTY_PREFS).firstAfterHours).toBe(24);
  });

  it("puts the person's own numbers on top", () => {
    const org = { ...DEFAULT_REMINDER_POLICY, firstAfterHours: 24, everyHours: 24 };
    const p = prefs({ reminderTiming: { firstAfterHours: 4, maxCount: 2, skipShabbat: false } });
    expect(effectiveReminderPolicy(org, p)).toEqual({ ...org, firstAfterHours: 4, maxCount: 2, skipShabbat: false });
  });
});

describe("remindersEnabledFor", () => {
  it("uses the form's switch until the person decides", () => {
    expect(remindersEnabledFor(undefined, true)).toBe(true);
    expect(remindersEnabledFor(undefined, false)).toBe(false);
    expect(remindersEnabledFor(prefs({ groups: { reminder: { enabled: true } } }), false)).toBe(true);
    expect(remindersEnabledFor(prefs({ groups: { reminder: { enabled: false } } }), true)).toBe(false);
  });
});
