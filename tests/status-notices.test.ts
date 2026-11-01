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

describe("watchers (secretariats)", () => {
  it("hear when the employee step is done, not other steps, and never twice", () => {
    const ctx2 = {
      subject: { name: "דנה", email: "d@x.org" },
      creator: { name: "מנהל", email: "m@x.org" },
      stepName: () => "עובד",
      stepRole: (id: string) => (id === "emp" ? "employee" : "approver"),
      watchers: [{ name: "מזכירות", email: "s@x.org" }, { name: "מנהל", email: "M@x.org" }],
    };
    const n = statusNotices([{ type: "step_completed", stepId: "emp" }], ctx2);
    expect(n.map((x) => x.to.email)).toEqual(["m@x.org", "s@x.org"]);
    expect(statusNotices([{ type: "step_completed", stepId: "appr" }], ctx2).map((x) => x.to.email)).toEqual(["m@x.org"]);
  });
});

describe("statusNotices with trigger settings", () => {
  const base = { subject: { name: "דנה", email: "d@x.org" }, creator: { name: "רות", email: "r@x.org" }, stepName: () => "עובד", stepRole: () => "employee", secretariat: [{ name: "מזכירות", email: "s@x.org" }], bookkeeping: [{ name: "הנה\"ח", email: "b@x.org" }] };
  it("a switched-off trigger sends nothing", () => {
    expect(statusNotices([{ type: "request_completed" }], { ...base, settings: { completed: { enabled: false, recipients: ["employee"], fixedRecipients: [] } } })).toEqual([]);
    expect(statusNotices([{ type: "step_completed", stepId: "e" }], { ...base, settings: { step_done: { enabled: false, recipients: ["creator"], fixedRecipients: [] } } })).toEqual([]);
  });
  it("chosen recipients: secretariat, bookkeeping and fixed addresses, each once", () => {
    const n = statusNotices([{ type: "request_completed" }], {
      ...base,
      settings: { completed: { enabled: true, recipients: ["secretariat", "bookkeeping", "fixed"], fixedRecipients: [{ name: "שכר", email: "S@x.org" }, { name: "חשבות", email: "c@x.org" }] } },
    });
    expect(n.map((x) => x.to.email)).toEqual(["s@x.org", "b@x.org", "c@x.org"]);
    expect(n[0]!.vars).toMatchObject({ name: "מזכירות", subject: " (דנה)" });
  });
  it("step done: secretariat only for the person's own step, fixed for every step", () => {
    const settings = { step_done: { enabled: true, recipients: ["secretariat", "fixed"] as const, fixedRecipients: [{ name: "קבוע", email: "f@x.org" }] } };
    const own = statusNotices([{ type: "step_completed", stepId: "e" }], { ...base, settings: { step_done: { ...settings.step_done, recipients: [...settings.step_done.recipients] } } });
    expect(own.map((x) => x.to.email)).toEqual(["s@x.org", "f@x.org"]);
    const other = statusNotices([{ type: "step_completed", stepId: "a" }], { ...base, stepRole: () => "approver", settings: { step_done: { ...settings.step_done, recipients: [...settings.step_done.recipients] } } });
    expect(other.map((x) => x.to.email)).toEqual(["f@x.org"]);
  });
});
