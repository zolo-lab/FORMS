import { describe, expect, it } from "vitest";
import { addApprover, checkChain, removeStep } from "@/lib/workflow/chain";
import type { Workflow } from "@/lib/workflow/types";

const pkg: Workflow = {
  steps: [
    { order: 1, role: "requester", action: "fill" },
    { order: 2, role: "employee", action: "fill_and_sign" },
    { order: 3, role: "approver", action: "approve", assignee: { name: "מנהל", email: "m@x.il" } },
  ],
};

describe("checkChain", () => {
  it("the package's own chain is not an override", () => {
    expect(checkChain(pkg, { steps: [...pkg.steps].reverse() })).toEqual({ ok: true, workflow: null });
  });
  it("accepts an added approver", () => {
    const r = checkChain(pkg, { steps: addApprover(pkg.steps, { name: "רו\"ח", email: "a@x.il" }) });
    expect(r.ok && r.workflow?.steps.map((s) => s.order)).toEqual([1, 2, 3, 4]);
  });
  it("accepts removing the approver", () => {
    const r = checkChain(pkg, { steps: removeStep(pkg.steps, 2) });
    expect(r.ok && r.workflow?.steps).toHaveLength(2);
  });
  it("refuses to remove the employee step, or to add a second one", () => {
    expect(checkChain(pkg, { steps: pkg.steps.filter((s) => s.role !== "employee") }).ok).toBe(false);
    expect(checkChain(pkg, { steps: [...pkg.steps, { order: 4, role: "employee", action: "fill" }] }).ok).toBe(false);
  });
  it("reports an invalid step (fixed approver without a name)", () => {
    const r = checkChain(pkg, { steps: [...pkg.steps, { order: 4, role: "approver", action: "approve" }] });
    expect(r.ok).toBe(false);
  });
  it("removeStep keeps the opener and the employee", () => {
    expect(removeStep(pkg.steps, 0)).toHaveLength(3);
    expect(removeStep(pkg.steps, 1)).toHaveLength(3);
  });
});
