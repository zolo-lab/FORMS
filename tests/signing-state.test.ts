import { describe, expect, it } from "vitest";
import { tokenState, shouldLogSave } from "@/lib/workflow/signing";
import { roleView } from "@/lib/forms/role-view";
import { sampleForm, validAnswers } from "./fixtures/sample-form";

const now = new Date("2026-10-13T10:00:00Z");
const ok = { revokedAt: null, expiresAt: new Date("2026-11-01T00:00:00Z") };

describe("tokenState", () => {
  it("ok for an open step", () => {
    expect(tokenState({ token: ok, stepStatus: "active", requestStatus: "in_progress", now })).toBe("ok");
    expect(tokenState({ token: ok, stepStatus: "in_progress", requestStatus: "returned", now })).toBe("ok");
  });
  it("invalid when the token is unknown", () => {
    expect(tokenState({ token: null, now })).toBe("invalid");
  });
  it("revoked", () => {
    expect(tokenState({ token: { ...ok, revokedAt: now }, stepStatus: "active", requestStatus: "in_progress", now })).toBe("revoked");
  });
  it("expired by token date or request status", () => {
    expect(tokenState({ token: { ...ok, expiresAt: new Date("2026-10-01T00:00:00Z") }, stepStatus: "active", requestStatus: "in_progress", now })).toBe("expired");
    expect(tokenState({ token: ok, stepStatus: "expired", requestStatus: "expired", now })).toBe("expired");
  });
  it("closed when the step is done or the request ended", () => {
    expect(tokenState({ token: ok, stepStatus: "completed", requestStatus: "in_progress", now })).toBe("closed");
    expect(tokenState({ token: ok, stepStatus: "active", requestStatus: "cancelled", now })).toBe("closed");
    expect(tokenState({ token: ok, stepStatus: "pending", requestStatus: "in_progress", now })).toBe("closed");
  });
});

describe("shouldLogSave", () => {
  it("logs at most once per 5 minutes", () => {
    expect(shouldLogSave(null, now)).toBe(true);
    expect(shouldLogSave(new Date("2026-10-13T09:58:00Z"), now)).toBe(false);
    expect(shouldLogSave(new Date("2026-10-13T09:54:00Z"), now)).toBe(true);
  });
});

describe("roleView", () => {
  const answers = { ...validAnswers, salary: 8500, jobPercent: 50 };
  it("employee sees only their own fields in the form", () => {
    const v = roleView(sampleForm, answers, "employee");
    const ids = v.definition.pages.flatMap((p) => p.fields.map((f) => f.id));
    expect(ids).not.toContain("salary");
    expect(ids).toContain("firstName");
    expect(ids).toContain("sig");
  });
  it("other roles' filled values appear in a read-only summary", () => {
    const v = roleView(sampleForm, answers, "employee");
    expect(v.filled.map((x) => x.label)).toEqual(["שכר חודשי", "אחוז משרה"]);
    expect(v.filled[1]!.text).toContain("50");
  });
  it("skips other-role fields that have no value", () => {
    expect(roleView(sampleForm, {}, "employee").filled).toEqual([]);
  });
  it("drops pages left empty", () => {
    const v = roleView(sampleForm, answers, "requester");
    expect(v.definition.pages.map((p) => p.id)).toEqual(["employment"]);
    expect(v.definition.pages[0]!.fields.map((f) => f.id)).toEqual(["salary", "jobPercent"]);
  });
});
