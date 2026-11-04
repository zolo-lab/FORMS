import { describe, expect, it } from "vitest";
import { fieldSteps, fillsIn, type FormDefinition } from "@/lib/forms/schema";
import { unassignedFields, withStep } from "@/lib/workflow/step-fields";
import { roleView } from "@/lib/forms/role-view";
import { validateAnswers } from "@/lib/forms/validate";

const steps = ["requester", "employee", "approver"] as const;

describe("a field shared by several steps", () => {
  it("knows every step that edits it", () => {
    const f = { filledBy: "employee" as const, alsoFilledBy: ["approver" as const] };
    expect(fieldSteps(f)).toEqual(["employee", "approver"]);
    expect(fillsIn(f, "approver")).toBe(true);
    expect(fillsIn(f, "requester")).toBe(false);
    expect(fillsIn({}, "employee")).toBe(true); // unassigned = the employee, as before
  });
  it("ticking a step adds it; the earliest step stays the field's own", () => {
    expect(withStep({ filledBy: "approver" }, "employee", true, [...steps])).toEqual({ filledBy: "employee", alsoFilledBy: ["approver"] });
    expect(withStep({ filledBy: "employee" }, "approver", true, [...steps])).toEqual({ filledBy: "employee", alsoFilledBy: ["approver"] });
  });
  it("unticking keeps the other steps, and the last one leaves it unassigned", () => {
    expect(withStep({ filledBy: "employee", alsoFilledBy: ["approver"] }, "employee", false, [...steps])).toEqual({ filledBy: "approver", alsoFilledBy: undefined });
    expect(withStep({ filledBy: "approver" }, "approver", false, [...steps])).toEqual({ filledBy: "unassigned", alsoFilledBy: undefined });
  });
  it("an unassigned field ticked into a step becomes that step's", () => {
    expect(withStep({ filledBy: "unassigned" }, "approver", true, [...steps])).toEqual({ filledBy: "approver", alsoFilledBy: undefined });
  });
  it("a field in any step of the form is not 'unassigned'", () => {
    const def = { pages: [{ id: "p", fields: [{ id: "a", type: "short_text", label: "א", filledBy: "payroll", alsoFilledBy: ["approver"] }] }] } as unknown as FormDefinition;
    expect(unassignedFields(def, ["employee", "approver"])).toEqual([]);
    expect(unassignedFields(def, ["employee"]).map((f) => f.id)).toEqual(["a"]);
  });
});

const def = {
  schemaVersion: 1, title: "t",
  pages: [{ id: "p1", title: "", fields: [
    { id: "role", type: "short_text", label: "תפקיד", required: true, filledBy: "employee", alsoFilledBy: ["approver"] },
    { id: "salary", type: "short_text", label: "שכר", filledBy: "employee" },
  ] }],
} as unknown as FormDefinition;

describe("what each step gets", () => {
  it("the second step sees the shared field to edit, and the rest as already filled", () => {
    const v = roleView(def, { role: "מורה", salary: "9000" }, "approver");
    expect(v.definition.pages.flatMap((p) => p.fields).map((f) => f.id)).toEqual(["role"]);
    expect(v.filled.map((f) => f.id)).toEqual(["salary"]);
  });
  it("the second step's correction is validated as its own", () => {
    expect(validateAnswers(def, { role: "", salary: "9000" }, { role: "approver" }).errors.role).toBeDefined();
    expect(validateAnswers(def, { role: "רכזת", salary: "9000" }, { role: "approver" }).ok).toBe(true);
  });
});
