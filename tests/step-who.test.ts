import { describe, expect, it } from "vitest";
import { stepChoices, stepFields, stepWhoOf } from "@/lib/workflow/step-who";

describe("step who", () => {
  it("reads the choice back from a stored step", () => {
    expect(stepWhoOf({ role: "requester" })).toBe("requester");
    expect(stepWhoOf({ role: "employee" })).toBe("employee");
    expect(stepWhoOf({ role: "approver", assigneeKind: "group_all" })).toBe("group_all");
    expect(stepWhoOf({ role: "payroll", assigneeFromFieldId: "mgr" })).toBe("from_field");
    expect(stepWhoOf({ role: "payroll" })).toBe("contact");
  });
  it("derives role, action and assignee kind from the choice", () => {
    expect(stepFields("requester", "payroll")).toEqual({ role: "requester", action: "fill" });
    expect(stepFields("employee", "approver")).toEqual({ role: "employee", action: "fill_and_sign" });
    expect(stepFields("contact", "payroll")).toEqual({ role: "payroll", action: "approve", assigneeKind: "contact" });
    expect(stepFields("from_field", "employee")).toEqual({ role: "approver", action: "approve", assigneeKind: "from_field" });
  });
});

describe("stepChoices", () => {
  const L = { requester: "מבקש", employee: "עובד", approver: "מאשר", payroll: "חשבות שכר", hr: "משאבי אנוש" } as const;
  it("names each step and merges steps that share a role", () => {
    expect(stepChoices([{ role: "requester" }, { role: "employee" }, { role: "payroll", assigneeKind: "contact" }, { role: "payroll", assigneeKind: "group_all" }], L)).toEqual([
      { role: "requester", label: "שלב 1 · מי ששולח את הטופס" },
      { role: "employee", label: "שלב 2 · העובד" },
      { role: "payroll", label: "שלבים 3, 4 · חשבות שכר" },
    ]);
  });
  it("keeps a role the field has but no step uses", () => {
    expect(stepChoices([{ role: "employee" }], L, "hr").at(-1)).toEqual({ role: "hr", label: "משאבי אנוש (אין שלב כזה בטופס)" });
  });
});
