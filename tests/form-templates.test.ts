import { describe, expect, it } from "vitest";
import { FORM_TEMPLATES, findTemplate } from "@/lib/forms/templates";
import { parseFormDefinition, allFields } from "@/lib/forms/schema";
import { publishIssues } from "@/lib/forms/builder";

describe("built-in form templates", () => {
  it.each(FORM_TEMPLATES.map((t) => [t.id, t] as const))("%s is valid and publishable", (_id, t) => {
    const r = parseFormDefinition(t.definition);
    expect(r.success).toBe(true);
    expect(publishIssues(t.definition)).toEqual([]);
    expect(allFields(t.definition).some((f) => f.filledBy === "requester")).toBe(true);
    expect(allFields(t.definition).some((f) => f.type === "signature")).toBe(true);
  });

  it("finds a template by id", () => {
    expect(findTemplate("intake-employee")?.name).toBe("קליטת עובד");
    expect(findTemplate("nope")).toBeUndefined();
  });
});
