import { describe, expect, it } from "vitest";
import { orgLabel, parseOrgInput } from "@/lib/orgs/input";

describe("parseOrgInput", () => {
  it("accepts a name, a 9-digit number and an optional project", () => {
    expect(parseOrgInput({ name: " אל עמי ", registrationNumber: "580556306", projectName: " קייטנה " })).toEqual({
      ok: true,
      value: { name: "אל עמי", registrationNumber: "580556306", projectName: "קייטנה" },
    });
  });
  it("project is optional", () => {
    expect(parseOrgInput({ name: "פנימה", registrationNumber: "580-556-306", projectName: "  " })).toEqual({
      ok: true,
      value: { name: "פנימה", registrationNumber: "580556306", projectName: null },
    });
  });
  it("rejects a missing name, a bad number and a too long project", () => {
    expect(parseOrgInput({ name: " ", registrationNumber: "580556306" })).toEqual({ ok: false, error: "name" });
    expect(parseOrgInput({ name: "x", registrationNumber: "12345" })).toEqual({ ok: false, error: "regnum" });
    expect(parseOrgInput({ name: "x", registrationNumber: "58055630a" })).toEqual({ ok: false, error: "regnum" });
    expect(parseOrgInput({ name: "x", registrationNumber: "580556306", projectName: "ש".repeat(121) })).toEqual({ ok: false, error: "project" });
    expect(parseOrgInput({})).toEqual({ ok: false, error: "name" });
  });
});

describe("orgLabel", () => {
  it("joins the name and the project", () => {
    expect(orgLabel({ name: "אל עמי", projectName: "קייטנה" })).toBe("אל עמי – קייטנה");
    expect(orgLabel({ name: "אל עמי", projectName: null })).toBe("אל עמי");
    expect(orgLabel({ name: "אל עמי" })).toBe("אל עמי");
  });
});
