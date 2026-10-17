import { describe, expect, it } from "vitest";
import { statusNotices } from "@/lib/notifications/status";
import { renderDefault } from "@/lib/notifications/templates";

const subject = { name: "דנה", email: "d@x.org", phone: "0501234567" };
const creator = { name: "רות", email: "r@x.org" };
const ctx = { subject, creator, stepName: (id: string) => `שלב ${id}` };

describe("statusNotices", () => {
  it("completed → the person and the opener", () => {
    const n = statusNotices([{ type: "step_completed", stepId: "s3" }, { type: "request_completed" }], ctx);
    expect(n.map((x) => [x.key, x.to.name])).toEqual([["completed", "דנה"], ["completed", "רות"]]);
  });
  it("declined carries the reason", () => {
    const n = statusNotices([{ type: "step_declined", stepId: "s2", payload: { reason: "חסר אישור" } }, { type: "request_declined" }], ctx);
    expect(n.map((x) => x.key)).toEqual(["declined", "declined"]);
    expect(n[0]!.vars.reason).toBe("חסר אישור");
  });
  it("a middle step only informs the opener", () => {
    const n = statusNotices([{ type: "step_completed", stepId: "s1" }, { type: "step_activated", stepId: "s2" }], ctx);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ key: "step_done", to: creator, vars: { stepName: "שלב s1", subject: "דנה" } });
  });
  it("no opener known → only the person is told, and only at the end", () => {
    expect(statusNotices([{ type: "step_completed", stepId: "s1" }], { ...ctx, creator: null })).toEqual([]);
    expect(statusNotices([{ type: "request_completed" }], { ...ctx, creator: null })).toHaveLength(1);
  });
  it("opener who is also the person is told once", () => {
    expect(statusNotices([{ type: "request_completed" }], { ...ctx, creator: { name: "דנה", email: "D@x.org" } })).toHaveLength(1);
  });
  it("templates render", () => {
    expect(renderDefault("step_done", { name: "רות", subject: "דנה", stepName: "בדיקה", org: "עמותה" }).body).toContain("בדיקה");
    expect(renderDefault("completed", { name: "דנה", org: "עמותה" }).body).not.toContain("{{");
  });
});
