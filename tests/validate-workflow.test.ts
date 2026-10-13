import { describe, expect, it } from "vitest";
import { normalizeOrders, validateWorkflow } from "@/lib/workflow/validate-workflow";

describe("validateWorkflow", () => {
  it("accepts the standard onboarding flow", () => {
    expect(
      validateWorkflow({
        steps: [
          { order: 1, role: "requester", action: "fill" },
          { order: 2, role: "employee", action: "fill_and_sign", otpRequired: true },
          { order: 3, role: "payroll", action: "approve", assignee: { name: "שכר", email: "payroll@example.org" } },
        ],
      }),
    ).toEqual([]);
  });
  it("rejects an empty workflow", () => {
    expect(validateWorkflow({ steps: [] })).toEqual(["אין שלבים במסלול"]);
  });
  it("a named assignee without contact details is allowed (the link is handed over manually)", () => {
    expect(validateWorkflow({ steps: [{ order: 1, role: "payroll", action: "approve", assignee: { name: "חשבות שכר" } }] })).toEqual([]);
  });
  it("requires a fixed assignee for approvers, payroll and HR", () => {
    const errs = validateWorkflow({ steps: [{ order: 1, role: "approver", action: "approve" }] });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("נמען");
  });
  it("accepts an assignee taken from an answer", () => {
    expect(validateWorkflow({ steps: [{ order: 1, role: "approver", action: "approve", assigneeFromFieldId: "managerEmail" }] })).toEqual([]);
  });
  it("checks email, phone and due hours", () => {
    const errs = validateWorkflow({ steps: [{ order: 1, role: "hr", action: "approve", dueHours: 0, assignee: { name: "דנה", email: "nope", phone: "12" } }] });
    expect(errs.join("|")).toMatch(/מייל/);
    expect(errs.join("|")).toMatch(/טלפון/);
    expect(errs.join("|")).toMatch(/שעות/);
  });
  it("OTP for a fixed approver needs an email", () => {
    const errs = validateWorkflow({ steps: [{ order: 1, role: "approver", action: "approve", otpRequired: true, assignee: { name: "דנה", phone: "0501234567" } }] });
    expect(errs.some((e) => e.includes("אימות בקוד"))).toBe(true);
  });
});

describe("normalizeOrders", () => {
  it("renumbers to 1..n and keeps parallel steps together", () => {
    const out = normalizeOrders([
      { order: 10, role: "payroll", action: "approve" },
      { order: 3, role: "employee", action: "fill" },
      { order: 3, role: "approver", action: "approve" },
    ]);
    expect(out.map((s) => s.order)).toEqual([1, 1, 2]);
    expect(out[2]!.role).toBe("payroll");
  });
});
