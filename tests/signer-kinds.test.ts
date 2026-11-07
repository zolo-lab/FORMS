import { describe, expect, it } from "vitest";
import { activateNext, completeStep, openStep, planSteps, requestStatus } from "@/lib/workflow/engine";
import { assigneeKindOf, groupIdOfSource } from "@/lib/workflow/assignee";
import { parseStepForm } from "@/lib/workflow/step-form";
import { validateWorkflow } from "@/lib/workflow/validate-workflow";
import type { PeopleDirectory, Workflow } from "@/lib/workflow/types";

let n = 0;
const id = () => `s${++n}`;

const people: PeopleDirectory = {
  contacts: {
    c1: { id: "c1", name: "הילה פרץ", email: "hila@x.il" },
    c2: { id: "c2", name: "מזכירות ארצנו", email: "office@x.il" },
    c3: { id: "c3", name: "מזכירות גרעין", phone: "0501234567" },
  },
  groups: { g1: [{ id: "c2", name: "מזכירות ארצנו", email: "office@x.il" }, { id: "c3", name: "מזכירות גרעין", phone: "0501234567" }] },
};

describe("assigneeKindOf", () => {
  it("reads older packages without a kind", () => {
    expect(assigneeKindOf({})).toBe("fixed");
    expect(assigneeKindOf({ assigneeFromFieldId: "manager" })).toBe("from_field");
    expect(assigneeKindOf({ assigneeKind: "group_all", assigneeFromFieldId: "x" })).toBe("group_all");
  });
  it("parses the group option source", () => {
    expect(groupIdOfSource("group:g1")).toBe("g1");
    expect(groupIdOfSource("banks")).toBeNull();
    expect(groupIdOfSource(undefined)).toBeNull();
  });
});

describe("planSteps with saved people", () => {
  it("a saved contact becomes the step's person", () => {
    const w: Workflow = { steps: [{ order: 1, role: "payroll", action: "approve", assigneeKind: "contact", contactId: "c1" }] };
    const [s] = planSteps(w, {}, id, people);
    expect(s).toMatchObject({ assigneeName: "הילה פרץ", assigneeEmail: "hila@x.il" });
  });

  it("a group step fans out to every member, in parallel", () => {
    const w: Workflow = {
      steps: [
        { order: 1, role: "employee", action: "fill_and_sign" },
        { order: 2, role: "approver", action: "approve", assigneeKind: "group_all", groupId: "g1" },
        { order: 3, role: "payroll", action: "approve", assigneeKind: "contact", contactId: "c1" },
      ],
    };
    const steps = planSteps(w, {}, id, people);
    expect(steps.map((s) => `${s.order}:${s.assigneeName}`)).toEqual(["1:undefined", "2:מזכירות ארצנו", "2:מזכירות גרעין", "3:הילה פרץ"]);
    expect(steps[2]).toMatchObject({ assigneePhone: "0501234567" });
  });

  it("an empty or unknown group still yields one step, without a person", () => {
    const w: Workflow = { steps: [{ order: 1, role: "approver", action: "approve", assigneeKind: "group_all", groupId: "nope" }] };
    const steps = planSteps(w, {}, id, people);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.assigneeName).toBeUndefined();
  });

  it("a dropdown listing a group stores the contact id, which resolves to the person", () => {
    const w: Workflow = { steps: [{ order: 1, role: "approver", action: "approve", assigneeKind: "from_field", assigneeFromFieldId: "manager" }] };
    const [s] = planSteps(w, { manager: "c2" }, id, people);
    expect(s).toMatchObject({ assigneeName: "מזכירות ארצנו", assigneeEmail: "office@x.il" });
  });

  it("a typed email in the field still works as before", () => {
    const w: Workflow = { steps: [{ order: 1, role: "approver", action: "approve", assigneeFromFieldId: "manager" }] };
    const [s] = planSteps(w, { manager: "boss@x.il" }, id, people);
    expect(s).toMatchObject({ assigneeEmail: "boss@x.il" });
  });

  it("parallel group members are all activated together", () => {
    const w: Workflow = { steps: [{ order: 1, role: "approver", action: "approve", assigneeKind: "group_all", groupId: "g1" }] };
    const r = activateNext(planSteps(w, {}, id, people), {});
    expect(r.steps.map((s) => s.status)).toEqual(["active", "active"]);
  });
});

describe("step form and validation", () => {
  const fd = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k]! : null) });

  it("parses the signer kind and keeps only the matching ids", () => {
    expect(parseStepForm(fd({ order: "2", role: "approver", action: "approve", assigneeKind: "contact", contactId: "c1", groupId: "g1", assigneeFromFieldId: "x" }))).toEqual({
      order: 2, role: "approver", action: "approve", assigneeKind: "contact", contactId: "c1",
    });
    expect(parseStepForm(fd({ order: "2", role: "approver", action: "approve", assigneeKind: "group_all", groupId: "g1" }))).toMatchObject({ assigneeKind: "group_all", groupId: "g1" });
    expect(parseStepForm(fd({ order: "2", role: "approver", action: "approve", assigneeKind: "from_field", assigneeFromFieldId: "manager" }))).toMatchObject({ assigneeKind: "from_field", assigneeFromFieldId: "manager" });
  });

  it("requires the id that the kind needs", () => {
    expect(validateWorkflow({ steps: [{ order: 1, role: "approver", action: "approve", assigneeKind: "contact" }] })[0]).toContain("איש קשר");
    expect(validateWorkflow({ steps: [{ order: 1, role: "approver", action: "approve", assigneeKind: "group_all" }] })[0]).toContain("קבוצה");
    expect(validateWorkflow({ steps: [{ order: 1, role: "approver", action: "approve", assigneeKind: "from_field" }] })[0]).toContain("השדה");
    expect(validateWorkflow({ steps: [{ order: 1, role: "approver", action: "approve", assigneeKind: "group_all", groupId: "g1" }] })).toEqual([]);
  });
});

describe("group_any: one member of the group signs", () => {
  const w: Workflow = {
    steps: [
      { order: 1, role: "employee", action: "fill_and_sign" },
      { order: 2, role: "approver", action: "approve", assigneeKind: "group_any", groupId: "g1" },
      { order: 3, role: "payroll", action: "approve", assigneeKind: "contact", contactId: "c1" },
    ],
  };

  const atGroup = () => {
    const planned = planSteps(w, {}, id, people);
    const r1 = activateNext(planned, {});
    return completeStep(r1.steps, r1.steps[0]!.id, {});
  };

  it("fans out to every member, marked anyOf, all active together", () => {
    const r = atGroup();
    const group = r.steps.filter((s) => s.order === 2);
    expect(group.map((s) => s.assigneeName)).toEqual(["מזכירות ארצנו", "מזכירות גרעין"]);
    expect(group.every((s) => s.anyOf && s.status === "active")).toBe(true);
    expect(r.steps.find((s) => s.order === 1)!.anyOf).toBeUndefined();
  });

  it("the first member to finish closes the step for the others and the chain moves on", () => {
    const r = atGroup();
    const [a, b] = r.steps.filter((s) => s.order === 2);
    const done = completeStep(r.steps, a!.id, {});
    expect(done.steps.find((s) => s.id === a!.id)!.status).toBe("completed");
    expect(done.steps.find((s) => s.id === b!.id)!.status).toBe("skipped");
    expect(done.steps.find((s) => s.order === 3)!.status).toBe("active");
    expect(done.events).toContainEqual({ type: "step_released", stepId: b!.id, payload: { byStepId: a!.id, by: "מזכירות ארצנו" } });
  });

  it("a member who already opened the link is released too", () => {
    const r = atGroup();
    const [a, b] = r.steps.filter((s) => s.order === 2);
    const opened = openStep(r.steps, b!.id);
    const done = completeStep(opened.steps, a!.id, {});
    expect(done.steps.find((s) => s.id === b!.id)!.status).toBe("skipped");
  });

  it("the request completes when the last step is done", () => {
    const r = atGroup();
    const [a] = r.steps.filter((s) => s.order === 2);
    const afterGroup = completeStep(r.steps, a!.id, {});
    const last = afterGroup.steps.find((s) => s.order === 3)!;
    const end = completeStep(afterGroup.steps, last.id, {});
    expect(requestStatus(end.steps)).toBe("completed");
    expect(end.events.some((e) => e.type === "request_completed")).toBe(true);
  });

  it("group_all is unchanged: every member must finish", () => {
    const all: Workflow = { steps: [{ order: 1, role: "approver", action: "approve", assigneeKind: "group_all", groupId: "g1" }, { order: 2, role: "payroll", action: "approve", assigneeKind: "contact", contactId: "c1" }] };
    const r = activateNext(planSteps(all, {}, id, people), {});
    const [a, b] = r.steps.filter((s) => s.order === 1);
    const one = completeStep(r.steps, a!.id, {});
    expect(one.steps.find((s) => s.id === b!.id)!.status).toBe("active");
    expect(one.steps.find((s) => s.order === 2)!.status).toBe("pending");
  });

  it("an empty group still yields one step without a person", () => {
    const empty: Workflow = { steps: [{ order: 1, role: "approver", action: "approve", assigneeKind: "group_any", groupId: "nope" }] };
    const steps = planSteps(empty, {}, id, people);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ anyOf: true });
    expect(steps[0]!.assigneeName).toBeUndefined();
  });

  it("is validated and parsed like a group step", () => {
    const fd = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k]! : null) });
    expect(parseStepForm(fd({ order: "2", role: "approver", action: "approve", assigneeKind: "group_any", groupId: "g1" }))).toMatchObject({ assigneeKind: "group_any", groupId: "g1" });
    expect(validateWorkflow({ steps: [{ order: 1, role: "approver", action: "approve", assigneeKind: "group_any" }] })[0]).toContain("קבוצה");
    expect(validateWorkflow({ steps: [{ order: 1, role: "approver", action: "approve", assigneeKind: "group_any", groupId: "g1" }] })).toEqual([]);
  });
});
