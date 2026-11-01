import { describe, expect, it } from "vitest";
import { assignRoles, draftOf, sanitizeDraft, stepFields, stepFromDraft, stepWhoOf } from "@/lib/workflow/step-who";
import { defaultEmailField, draftProblems, stepViews, unassignedFields } from "@/lib/workflow/step-fields";
import type { FormDefinition } from "@/lib/forms/schema";

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

describe("assignRoles", () => {
  it("gives each person step its own role, keeping valid ones", () => {
    const out = assignRoles([
      { who: "requester" as const, role: "requester" as const },
      { who: "contact" as const, role: "approver" as const },
      { who: "group_all" as const, role: "approver" as const },
      { who: "email" as const, role: "requester" as const },
      { who: "employee" as const, role: "employee" as const },
    ]);
    expect(out.map((d) => d.role)).toEqual(["requester", "approver", "approver2", "approver3", "employee"]);
  });
  it("keeps an older payroll step as it is", () => {
    expect(assignRoles([{ who: "email" as const, role: "payroll" as const }])[0]!.role).toBe("payroll");
  });
});

describe("assignRoles keeps steps and fields apart", () => {
  it("never reuses a role still held by fields of a deleted step", () => {
    const out = assignRoles([{ who: "requester" as const, role: "requester" as const }, { who: "contact" as const, role: "approver" as const }], ["approver"]);
    expect(out[1]!.role).toBe("approver2");
  });
  it("gives the sender and the employee their fixed roles", () => {
    expect(assignRoles([{ who: "requester" as const, role: "approver" as const }, { who: "employee" as const, role: "approver2" as const }]).map((d) => d.role)).toEqual(["requester", "employee"]);
  });
});

describe("step names and fields", () => {
  const ctx = { contacts: [{ id: "c1", label: "דנה כהן · dana@x.org" }], groups: [{ id: "g1", label: "שכר (3)" }], fields: [{ id: "mgr", label: "מייל מנהל" }] };
  it("names every step after who it goes to, each one separately", () => {
    expect(stepViews([
      { who: "requester", role: "requester" },
      { who: "employee", role: "employee" },
      { who: "contact", role: "approver", contactId: "c1" },
      { who: "group_all", role: "approver2", groupId: "g1" },
      { who: "email", role: "approver3", email: "p@x.org" },
      { who: "from_field", role: "approver4", fieldId: "mgr" },
    ], ctx).map((v) => v.label)).toEqual([
      "שלב 1 · השולח", "שלב 2 · העובד", "שלב 3 · דנה כהן", "שלב 4 · קבוצה: שכר", "שלב 5 · p@x.org", 'שלב 6 · המייל מ"מייל מנהל"',
    ]);
  });
  it("finds fields that are in no step (a form without an employee step)", () => {
    const def: FormDefinition = { schemaVersion: 1, title: "t", pages: [{ id: "p", title: "p", fields: [
      { id: "a", type: "short_text", label: "א" },
      { id: "b", type: "short_text", label: "ב", filledBy: "requester" },
      { id: "c", type: "short_text", label: "ג", filledBy: "unassigned" },
    ] }] };
    expect(unassignedFields(def, ["requester", "approver"]).map((f) => f.id)).toEqual(["a", "c"]);
  });
  it("checks each step in the editor's words", () => {
    const emailFields = [{ id: "mgr", label: "מייל מנהל", role: "employee" as const }];
    const p = draftProblems([
      { who: "requester", role: "requester" },
      { who: "from_field", role: "approver", fieldId: "mgr" },
      { who: "employee", role: "employee" },
      { who: "email", role: "approver2", email: "nope" },
      { who: "requester", role: "requester" },
    ], emailFields);
    expect(p[1]).toEqual(['השדה "מייל מנהל" ממולא בשלב 3. צריך שדה משלב קודם']);
    expect(p[3]).toEqual(["המייל לא תקין"]);
    expect(p[4]).toEqual(["השולח יכול להיות רק שלב 1"]);
    expect(defaultEmailField([{ role: "requester" }, { role: "employee" }, { role: "approver" }], 2, emailFields)).toBe("mgr");
  });
});
