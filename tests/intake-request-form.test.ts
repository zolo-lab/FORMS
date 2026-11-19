import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { publishIssues } from "@/lib/forms/builder";
import { allFields, parseFormDefinition } from "@/lib/forms/schema";
import { reachedPageIndexes } from "@/lib/forms/wizard";
import { intakeRequestForm as form } from "../scripts/intake-request-form";

const path = (answers: Record<string, unknown>) => reachedPageIndexes(form, answers).map((i) => form.pages[i]!.id);

describe("שאלון העסקה (as in Google Forms)", () => {
  it("is valid, publishable and filled by the requester only", () => {
    expect(parseFormDefinition(form).success).toBe(true);
    expect(publishIssues(form)).toEqual([]);
    expect(allFields(form).every((f) => f.filledBy === "requester")).toBe(true);
  });

  it("matches the JSON kept for import", () => {
    expect(JSON.parse(readFileSync("docs/templates/intake-request-google-form.json", "utf8"))).toEqual(JSON.parse(JSON.stringify(form)));
  });

  it("asks about the relative only when there is one", () => {
    expect(path({ is_relative: "כן" })).toContain("relative");
    expect(path({ is_relative: "לא" })).not.toContain("relative");
  });

  it("sends each department to its own list of profit centres", () => {
    expect(path({ department: "ארצנו", has_pc3_artzenu: "כן" })).toEqual(["employee", "terms", "more", "artzenu", "pc3_artzenu", "summary"]);
    expect(path({ department: "ארצנו", has_pc3_artzenu: "לא" })).toEqual(["employee", "terms", "more", "artzenu", "summary"]);
    expect(path({ department: "פעילות- גרעין" })).toEqual(["employee", "terms", "more", "garin", "summary"]);
    expect(path({ department: "פעילות - פנימה" })).toEqual(["employee", "terms", "more", "pnima", "summary"]);
    expect(path({ department: "ישיבה - אל עמי" })).toEqual(["employee", "terms", "more", "elami", "summary"]);
    expect(path({ department: "מחלקה ומרכז רווח נשארים אותו דבר" })).toEqual(["employee", "terms", "more", "summary"]);
  });

  it("lets profit centre 1 decide when both it and the department are answered", () => {
    expect(path({ department: 'ת"ת' })).toEqual(["employee", "terms", "more", "office", "summary"]);
    expect(path({ department: 'ת"ת', profit_center_1: 'ת"ת שיבת ציון', has_pc3_tt: "כן" })).toEqual(["employee", "terms", "more", "tt", "pc3_tt", "summary"]);
    expect(path({ department: 'ת"ת', profit_center_1: 'ת"ת שיבת ציון', has_pc3_tt: "לא" })).toEqual(["employee", "terms", "more", "tt", "summary"]);
  });

  it("keeps the lists of the Google form", () => {
    const count = (id: string) => allFields(form).find((f) => f.id === id)?.options?.length;
    expect([count("pc2_office"), count("pc2_tt"), count("pc2_artzenu"), count("pc2_garin"), count("pc2_pnima"), count("pc2_elami"), count("pc3_tt"), count("pc3_artzenu"), count("travels"), count("manager")]).toEqual([16, 27, 42, 28, 46, 28, 70, 104, 7, 7]);
  });
});
