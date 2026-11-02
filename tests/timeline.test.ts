import { describe, expect, it } from "vitest";
import { buildTimeline, groupStepsByRequest, whoOf, wholeDays, type TimelineStepInput } from "@/lib/requests/timeline";

const now = new Date("2026-11-10T10:00:00Z");
const daysAgo = (n: number, h = 0) => new Date(now.getTime() - n * 86_400_000 - h * 3_600_000);

const chain = (over: Partial<Record<string, Partial<TimelineStepInput>>> = {}): TimelineStepInput[] => [
  { id: "s0", order: 0, role: "requester", status: "completed", assigneeName: "רות לוי", assigneeEmail: "ruth@x.org", completedAt: daysAgo(6), ...over.s0 },
  { id: "s1", order: 1, role: "employee", status: "completed", assigneeName: "דנה כהן", assigneeEmail: "dana@x.org", activatedAt: daysAgo(6), firstViewedAt: daysAgo(5), completedAt: daysAgo(4), ...over.s1 },
  { id: "s2", order: 2, role: "approver", status: "active", assigneeName: "משה", assigneeEmail: "Moshe@X.org", activatedAt: daysAgo(4, 2), ...over.s2 },
  { id: "s3", order: 3, role: "approver2", status: "pending", assigneeName: "יעל", assigneeEmail: "yael@x.org", ...over.s3 },
  { id: "s4", order: 4, role: "payroll", status: "pending", assigneeName: "שכר", assigneeEmail: "payroll@x.org", ...over.s4 },
];

describe("buildTimeline", () => {
  it("marks done / current / upcoming in order and counts whole days on the current step", () => {
    const t = buildTimeline(chain(), "in_progress", { now });
    expect(t.steps.map((s) => s.state)).toEqual(["done", "done", "current", "upcoming", "upcoming"]);
    expect(t.steps[2]!.daysWaiting).toBe(4);
    expect(t.steps[1]!.daysWaiting).toBeNull();
    expect(t.summary).toBe("אצל משה · יום 4");
  });

  it("flags a step stuck from the threshold (default 3 days), not before", () => {
    expect(buildTimeline(chain(), "in_progress", { now }).stuck).toBe(true);
    expect(buildTimeline(chain(), "in_progress", { now, stuckDays: 5 }).stuck).toBe(false);
    const fresh = buildTimeline(chain({ s2: { activatedAt: daysAgo(2, 23) } }), "in_progress", { now });
    expect(fresh.steps[2]!.daysWaiting).toBe(2);
    expect(fresh.stuck).toBe(false);
  });

  it("says 'מהיום' on the first day", () => {
    expect(buildTimeline(chain({ s2: { activatedAt: daysAgo(0, 3) } }), "in_progress", { now }).summary).toBe("אצל משה · מהיום");
  });

  it("sorts by order whatever the input order", () => {
    const t = buildTimeline(chain().reverse(), "in_progress", { now });
    expect(t.steps.map((s) => s.id)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
  });

  describe("where the viewer stands", () => {
    it("their turn now (e-mail matched case-insensitively)", () => {
      const t = buildTimeline(chain(), "in_progress", { now, viewerEmail: "moshe@x.org" });
      expect(t.viewerNote).toBe("תורך עכשיו");
      expect(t.steps.filter((s) => s.isViewer).map((s) => s.id)).toEqual(["s2"]);
    });
    it("next in line", () => {
      expect(buildTimeline(chain(), "in_progress", { now, viewerEmail: "yael@x.org" }).viewerNote).toBe("אתה השלב הבא");
    });
    it("further down: counts the steps still ahead", () => {
      expect(buildTimeline(chain(), "in_progress", { now, viewerEmail: "payroll@x.org" }).viewerNote).toBe("לפניך עוד 2 שלבים");
    });
    it("parallel steps (same order) count once", () => {
      const steps = chain();
      steps.splice(3, 0, { id: "s3b", order: 3, role: "approver3", status: "pending", assigneeEmail: "other@x.org" });
      expect(buildTimeline(steps, "in_progress", { now, viewerEmail: "payroll@x.org" }).viewerNote).toBe("לפניך עוד 2 שלבים");
    });
    it("already handled their step", () => {
      expect(buildTimeline(chain(), "in_progress", { now, viewerEmail: "dana@x.org" }).viewerNote).toBe("סיימת את השלב שלך");
    });
    it("not in the chain: no note", () => {
      expect(buildTimeline(chain(), "in_progress", { now, viewerEmail: "nobody@x.org" }).viewerNote).toBeNull();
    });
  });

  it("returned: shows the step that returned it with its reason", () => {
    const t = buildTimeline(
      chain({ s1: { status: "active", completedAt: null, activatedAt: daysAgo(1) }, s2: { status: "returned", returnReason: "חסר צילום ת\"ז" } }),
      "returned",
      { now },
    );
    expect(t.steps[2]).toMatchObject({ state: "returned", reason: 'חסר צילום ת"ז' });
    expect(t.steps[1]!.state).toBe("current");
    expect(t.summary).toBe("אצל העובד – דנה כהן · יום 1");
  });

  it("declined: summary names who declined and why", () => {
    const t = buildTimeline(chain({ s2: { status: "declined", declineReason: "לא מאושר תקציבית" } }), "declined", { now });
    expect(t.summary).toBe("נדחה אצל משה · לא מאושר תקציבית");
    expect(t.stuck).toBe(false);
  });

  it("a cancelled request leaves no step 'current' and nothing stuck", () => {
    const t = buildTimeline(chain(), "cancelled", { now, viewerEmail: "moshe@x.org" });
    expect(t.steps[2]!.state).toBe("closed");
    expect(t.stuck).toBe(false);
    expect(t.summary).toBe("בוטל");
    expect(t.viewerNote).toBeNull();
  });

  it("completed", () => {
    const steps = chain({ s2: { status: "completed", completedAt: daysAgo(1) }, s3: { status: "skipped" }, s4: { status: "completed", completedAt: daysAgo(0) } });
    const t = buildTimeline(steps, "completed", { now });
    expect(t.summary).toBe("הושלם – כל השלבים חתמו");
    expect(t.steps.map((s) => s.state)).toEqual(["done", "done", "done", "skipped", "done"]);
  });
});

describe("helpers", () => {
  it("whoOf", () => {
    expect(whoOf({ role: "employee", assigneeName: "דנה" })).toBe("העובד – דנה");
    expect(whoOf({ role: "employee" })).toBe("העובד");
    expect(whoOf({ role: "requester" })).toBe("השולח");
    expect(whoOf({ role: "approver", assigneeEmail: "a@x.org" })).toBe("a@x.org");
    expect(whoOf({ role: "approver" })).toBe("מאשר");
  });
  it("wholeDays never goes negative", () => {
    expect(wholeDays(now, daysAgo(1))).toBe(0);
    expect(wholeDays(daysAgo(3, 1), now)).toBe(3);
  });
  it("groupStepsByRequest", () => {
    const g = groupStepsByRequest([{ requestId: "a", n: 1 }, { requestId: "b", n: 2 }, { requestId: "a", n: 3 }]);
    expect(g.get("a")!.map((r) => r.n)).toEqual([1, 3]);
    expect(g.get("b")!.length).toBe(1);
  });
});
