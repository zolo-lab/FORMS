import { describe, expect, it } from "vitest";
import { stepFields, stepWhoOf } from "@/lib/workflow/step-who";

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
