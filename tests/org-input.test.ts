import { describe, expect, it } from "vitest";
import { orgLabel, parseOrgInput, parseProjectName } from "@/lib/orgs/input";

describe("parseOrgInput", () => {
  it("accepts a name and a 9-digit registration number", () => {
    expect(parseOrgInput({ name: " אל עמי ", registrationNumber: "580-556 306" })).toEqual({ ok: true, value: { name: "אל עמי", registrationNumber: "580556306" } });
  });
  it("rejects a missing name and a bad number", () => {
    expect(parseOrgInput({ name: " ", registrationNumber: "580556306" })).toEqual({ ok: false, error: "name" });
    expect(parseOrgInput({ name: "x", registrationNumber: "12345" })).toEqual({ ok: false, error: "regnum" });
    expect(parseOrgInput({ name: "x", registrationNumber: "58055630a" })).toEqual({ ok: false, error: "regnum" });
    expect(parseOrgInput({})).toEqual({ ok: false, error: "name" });
  });
});

describe("parseProjectName", () => {
  it("trims, and refuses empty or too long names", () => {
    expect(parseProjectName("  קייטנה ")).toBe("קייטנה");
    expect(parseProjectName("   ")).toBeNull();
    expect(parseProjectName(undefined)).toBeNull();
    expect(parseProjectName("ש".repeat(121))).toBeNull();
  });
});

describe("orgLabel", () => {
  it("joins the organization and the project", () => {
    expect(orgLabel("אל עמי", "קייטנה")).toBe("אל עמי – קייטנה");
    expect(orgLabel("אל עמי", null)).toBe("אל עמי");
    expect(orgLabel("אל עמי")).toBe("אל עמי");
  });
});
