import { describe, expect, it } from "vitest";
import { draftOf, sanitizeDraft, stepChoices, stepFields, stepFromDraft, stepWhoOf } from "@/lib/workflow/step-who";

describe("step who", () => {
  it("reads the choice back from a stored step", () => {
    expect(stepWhoOf({ role: "requester" })).toBe("requester");
    expect(stepWhoOf({ role: "employee" })).toBe("employee");
    expect(stepWhoOf({ role: "approver", assigneeKind: "group_all" })).toBe("group_all");
    expect(stepWhoOf({ role: "payroll", assigneeFromFieldId: "mgr" })).toBe("from_field");
    expect(stepWhoOf({ role: "payroll", assigneeKind: "contact" })).toBe("contact");
    expect(stepWhoOf({ role: "payroll" })).toBe("email");
  });
  it("derives role, action and assignee kind from the choice", () => {
    expect(stepFields("requester", "payroll")).toEqual({ role: "requester", action: "fill" });
    expect(stepFields("employee", "approver")).toEqual({ role: "employee", action: "fill_and_sign" });
    expect(stepFields("contact", "payroll")).toEqual({ role: "payroll", action: "approve", assigneeKind: "contact" });
    expect(stepFields("email", "hr")).toEqual({ role: "hr", action: "approve", assigneeKind: "fixed" });
    expect(stepFields("from_field", "employee")).toEqual({ role: "approver", action: "approve", assigneeKind: "from_field" });
  });
});

describe("stepChoices", () => {
  const L = { requester: "מבקש", employee: "עובד", approver: "מאשר", payroll: "חשבות שכר", hr: "משאבי אנוש" } as const;
  it("names each step and merges steps that share a role", () => {
    expect(stepChoices([{ role: "requester" }, { role: "employee" }, { role: "payroll", assigneeKind: "contact" }, { role: "payroll", assigneeKind: "group_all" }], L)).toEqual([
      { role: "requester", label: "שלב 1 · מי ששולח את הטופס" },
      { role: "employee", label: "שלב 2 · העובד (מי שהטופס נשלח אליו)" },
      { role: "payroll", label: "שלבים 3, 4 · חשבות שכר" },
    ]);
  });
  it("keeps a role the field has but no step uses", () => {
    expect(stepChoices([{ role: "employee" }], L, "hr").at(-1)).toEqual({ role: "hr", label: "משאבי אנוש (אין שלב כזה בטופס)" });
  });
});

describe("step drafts (the steps editor)", () => {
  it("round-trips a stored step", () => {
    const step = { order: 3, role: "payroll" as const, action: "approve" as const, assigneeKind: "fixed" as const, assignee: { name: "שכר", email: "p@example.org" }, otpRequired: true, formOnly: true };
    expect(stepFromDraft(draftOf(step), 2)).toEqual(step);
  });
  it("numbers steps by position and keeps only the detail the choice needs", () => {
    expect(stepFromDraft({ who: "group_all", role: "hr", groupId: "g1", contactId: "c1", email: "x@y.z" }, 0)).toEqual({ order: 1, role: "hr", action: "approve", assigneeKind: "group_all", groupId: "g1" });
    expect(stepFromDraft({ who: "employee", role: "approver", formOnly: true }, 1)).toEqual({ order: 2, role: "employee", action: "fill_and_sign", formOnly: true });
  });
  it("cleans what the browser sends", () => {
    expect(sanitizeDraft({ who: "hack", role: "boss", email: 5, formOnly: "yes" })).toMatchObject({ who: "employee", role: "approver", email: undefined, formOnly: false });
  });
});
