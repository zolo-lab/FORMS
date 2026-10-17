import { describe, expect, it } from "vitest";
import {
  activateNext,
  cancelAll,
  completeStep,
  declineStep,
  delegate,
  expire,
  openStep,
  planSteps,
  requestStatus,
  returnTo,
  type EngineStep,
} from "@/lib/workflow/engine";
import type { Workflow } from "@/lib/workflow/types";

let n = 0;
const id = () => `s${++n}`;
const byOrder = (steps: EngineStep[]) => steps.map((s) => `${s.order}:${s.status}`).join(" ");

const serial: Workflow = {
  steps: [
    { order: 1, role: "requester", action: "fill" },
    { order: 2, role: "employee", action: "fill_and_sign" },
    { order: 3, role: "payroll", action: "approve", assignee: { name: "שכר", email: "p@x.il" } },
  ],
};

function started(w: Workflow, answers = {}) {
  n = 0;
  const planned = planSteps(w, answers, id);
  return activateNext(planned, answers);
}

describe("planSteps", () => {
  it("creates pending steps with fixed assignees", () => {
    n = 0;
    const steps = planSteps(serial, {}, id);
    expect(byOrder(steps)).toBe("1:pending 2:pending 3:pending");
    expect(steps[2]!.assigneeEmail).toBe("p@x.il");
    expect(steps[2]!.assigneeName).toBe("שכר");
  });
  it("takes assignee from an answer (email string or object)", () => {
    const w: Workflow = {
      steps: [
        { order: 1, role: "approver", action: "approve", assigneeFromFieldId: "mgr" },
        { order: 2, role: "hr", action: "view", assigneeFromFieldId: "hr" },
      ],
    };
    n = 0;
    const steps = planSteps(w, { mgr: "boss@x.il", hr: { name: "הילה", phone: "050-1234567" } }, id);
    expect(steps[0]!.assigneeEmail).toBe("boss@x.il");
    expect(steps[1]!.assigneeName).toBe("הילה");
    expect(steps[1]!.assigneePhone).toBe("050-1234567");
  });
});

describe("serial flow", () => {
  it("activates only the first step, then advances on completion", () => {
    let { steps } = started(serial);
    expect(byOrder(steps)).toBe("1:active 2:pending 3:pending");
    ({ steps } = completeStep(steps, "s1", {}));
    expect(byOrder(steps)).toBe("1:completed 2:active 3:pending");
    expect(requestStatus(steps)).toBe("in_progress");
    ({ steps } = completeStep(steps, "s2", {}));
    const r = completeStep(steps, "s3", {});
    expect(byOrder(r.steps)).toBe("1:completed 2:completed 3:completed");
    expect(requestStatus(r.steps)).toBe("completed");
    expect(r.events.map((e) => e.type)).toContain("request_completed");
  });
  it("opening an active step makes it in_progress", () => {
    const { steps } = started(serial);
    const r = openStep(steps, "s1");
    expect(r.steps[0]!.status).toBe("in_progress");
    expect(completeStep(r.steps, "s1", {}).steps[0]!.status).toBe("completed");
  });
  it("rejects completing a pending step", () => {
    const { steps } = started(serial);
    expect(() => completeStep(steps, "s2", {})).toThrow();
  });
});

describe("parallel flow", () => {
  const w: Workflow = {
    steps: [
      { order: 1, role: "employee", action: "fill" },
      { order: 2, role: "approver", action: "approve" },
      { order: 2, role: "hr", action: "approve" },
      { order: 3, role: "payroll", action: "approve" },
    ],
  };
  it("opens all same-order steps together and waits for all", () => {
    let { steps } = started(w);
    ({ steps } = completeStep(steps, "s1", {}));
    expect(byOrder(steps)).toBe("1:completed 2:active 2:active 3:pending");
    ({ steps } = completeStep(steps, "s2", {}));
    expect(byOrder(steps)).toBe("1:completed 2:completed 2:active 3:pending");
    ({ steps } = completeStep(steps, "s3", {}));
    expect(byOrder(steps)).toBe("1:completed 2:completed 2:completed 3:active");
  });
});

describe("skipIf", () => {
  const w: Workflow = {
    steps: [
      { order: 1, role: "requester", action: "fill" },
      { order: 2, role: "approver", action: "approve", skipIf: { field: "salary", op: "lt", value: 10000 } },
      { order: 3, role: "payroll", action: "approve" },
    ],
  };
  it("skips a step whose condition holds and moves on", () => {
    const { steps } = started(w);
    const r = completeStep(steps, "s1", { salary: 8000 });
    expect(byOrder(r.steps)).toBe("1:completed 2:skipped 3:active");
    expect(r.events.map((e) => e.type)).toContain("step_skipped");
  });
  it("does not skip when the condition fails", () => {
    const { steps } = started(w);
    const r = completeStep(steps, "s1", { salary: 20000 });
    expect(byOrder(r.steps)).toBe("1:completed 2:active 3:pending");
  });
  it("completes when the last steps are skipped", () => {
    const w2: Workflow = {
      steps: [
        { order: 1, role: "requester", action: "fill" },
        { order: 2, role: "hr", action: "view", skipIf: { field: "x", op: "eq", value: 1 } },
      ],
    };
    const { steps } = started(w2);
    const r = completeStep(steps, "s1", { x: 1 });
    expect(requestStatus(r.steps)).toBe("completed");
  });
});

describe("returnTo", () => {
  it("returns step 3 to step 1; intermediate steps reset, then flow resumes", () => {
    let { steps } = started(serial);
    ({ steps } = completeStep(steps, "s1", {}));
    ({ steps } = completeStep(steps, "s2", {}));
    let r = returnTo(steps, "s3", "s1", "חסר תלוש");
    expect(byOrder(r.steps)).toBe("1:active 2:pending 3:returned");
    expect(requestStatus(r.steps)).toBe("returned");
    expect(r.steps[2]!.returnReason).toBe("חסר תלוש");
    r = completeStep(r.steps, "s1", {});
    expect(byOrder(r.steps)).toBe("1:completed 2:active 3:returned");
    r = completeStep(r.steps, "s2", {});
    expect(byOrder(r.steps)).toBe("1:completed 2:completed 3:active");
    expect(requestStatus(r.steps)).toBe("in_progress");
  });
  it("requires a reason and an earlier completed target", () => {
    let { steps } = started(serial);
    ({ steps } = completeStep(steps, "s1", {}));
    expect(() => returnTo(steps, "s2", "s1", "")).toThrow();
    expect(() => returnTo(steps, "s2", "s3", "x")).toThrow();
  });
});

describe("delegate", () => {
  it("replaces the step with a new active one for another person", () => {
    let { steps } = started(serial);
    ({ steps } = completeStep(steps, "s1", {}));
    const r = delegate(steps, "s2", { name: "אורי", email: "u@x.il" }, id);
    expect(r.steps.find((s) => s.id === "s2")!.status).toBe("delegated");
    const fresh = r.steps.find((s) => s.delegatedFromStepId === "s2")!;
    expect(fresh.status).toBe("active");
    expect(fresh.order).toBe(2);
    expect(fresh.assigneeEmail).toBe("u@x.il");
    expect(requestStatus(r.steps)).toBe("in_progress");
    const done = completeStep(completeStep(r.steps, fresh.id, {}).steps, "s3", {});
    expect(requestStatus(done.steps)).toBe("completed");
  });
});

describe("decline / expire / cancel", () => {
  it("decline needs a reason and ends the request", () => {
    const { steps } = started(serial);
    expect(() => declineStep(steps, "s1", " ")).toThrow();
    const r = declineStep(steps, "s1", "לא מסכים");
    expect(r.steps[0]!.declineReason).toBe("לא מסכים");
    expect(requestStatus(r.steps)).toBe("declined");
    expect(r.steps.filter((s) => s.status === "cancelled")).toHaveLength(2);
  });
  it("expire marks open steps expired", () => {
    const { steps } = started(serial);
    const r = expire(steps);
    expect(byOrder(r.steps)).toBe("1:expired 2:pending 3:pending");
    expect(requestStatus(r.steps)).toBe("expired");
  });
  it("cancelAll cancels everything open", () => {
    let { steps } = started(serial);
    ({ steps } = completeStep(steps, "s1", {}));
    const r = cancelAll(steps, "בטעות");
    expect(byOrder(r.steps)).toBe("1:completed 2:cancelled 3:cancelled");
    expect(requestStatus(r.steps)).toBe("cancelled");
  });
});

describe("requestStatus", () => {
  it("is draft before activation", () => {
    n = 0;
    expect(requestStatus(planSteps(serial, {}, id))).toBe("draft");
  });
  it("is in_progress while a step is active", () => {
    expect(requestStatus(started(serial).steps)).toBe("in_progress");
  });
});

describe("requester as assignee (6.15a)", () => {
  const w: Workflow = {
    steps: [
      { order: 1, role: "requester", action: "fill" },
      { order: 2, role: "approver", action: "approve", assigneeKind: "requester" },
      { order: 3, role: "employee", action: "fill_and_sign" },
      { order: 4, role: "approver", action: "approve", assigneeKind: "requester" },
      { order: 5, role: "payroll", action: "approve", assignee: { name: "שכר", email: "p@x.il" } },
    ],
  };
  it("routes the step to the person who opened the request, wherever it sits in the chain", () => {
    const steps = planSteps(w, {}, id, { requester: { name: "רות", email: "r@x.il", phone: "0501234567" } });
    const mine = steps.filter((s) => s.order === 2 || s.order === 4);
    expect(mine.map((s) => [s.assigneeName, s.assigneeEmail, s.assigneePhone])).toEqual([
      ["רות", "r@x.il", "0501234567"],
      ["רות", "r@x.il", "0501234567"],
    ]);
  });
  it("without a known opener the step is created without a person (admin can delegate)", () => {
    const steps = planSteps(w, {}, id, {});
    expect(steps.find((s) => s.order === 2)).toMatchObject({ assigneeName: undefined, assigneeEmail: undefined });
  });
});
