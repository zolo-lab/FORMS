import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseFormDefinition, allFields } from "@/lib/forms/schema";
import { validateAnswers } from "@/lib/forms/validate";

const raw = JSON.parse(readFileSync("docs/templates/intake-employee.json", "utf8"));

describe("intake-employee template", () => {
  it("is a valid form definition", () => {
    const r = parseFormDefinition(raw);
    expect(r.success).toBe(true);
  });

  it("has requester fields for the wizard (step 3)", () => {
    const r = parseFormDefinition(raw);
    if (!r.success) throw new Error("invalid");
    const req = allFields(r.data).filter((f) => f.filledBy === "requester");
    expect(req.map((f) => f.id)).toEqual(
      expect.arrayContaining(["job_title", "start_date", "scope_pct", "salary_type", "salary_amount"]),
    );
  });

  it("validates requester answers (numbers stored as numbers)", () => {
    const r = parseFormDefinition(raw);
    if (!r.success) throw new Error("invalid");
    const reqOnly = { ...r.data, pages: r.data.pages.map((p) => ({ ...p, fields: p.fields.filter((f) => f.filledBy === "requester") })) };
    const v = validateAnswers(reqOnly, {
      job_title: "מדריך",
      start_date: "2026-11-01",
      scope_pct: "80",
      salary_type: "monthly",
      salary_amount: "12000",
    });
    expect(v.ok).toBe(true);
    expect(v.cleaned.salary_amount).toBe(12000);
  });
});
