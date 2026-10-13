import { describe, expect, it } from "vitest";
import { parseStepForm } from "@/lib/workflow/step-form";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("parseStepForm", () => {
  it("reads a payroll step with a fixed assignee", () => {
    expect(parseStepForm(fd({ order: "3", role: "payroll", action: "approve", assigneeName: " שכר ", assigneeEmail: "p@example.org", dueHours: "48", otpRequired: "on" }))).toEqual({
      order: 3,
      role: "payroll",
      action: "approve",
      otpRequired: true,
      dueHours: 48,
      assignee: { name: "שכר", email: "p@example.org" },
    });
  });
  it("falls back to safe values for unknown role/action and drops empty optionals", () => {
    expect(parseStepForm(fd({ order: "x", role: "boss", action: "hack" }))).toEqual({ order: 0, role: "employee", action: "fill" });
  });
});
