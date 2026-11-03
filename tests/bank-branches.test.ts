import { describe, expect, it } from "vitest";
import { BANK_LIST, branchesOf, isKnownBranch, searchBranches } from "@/lib/forms/bank-branches";
import { validateAnswers } from "@/lib/forms/validate";
import type { FormDefinition } from "@/lib/forms/schema";

describe("banks and branches (Bank of Israel list)", () => {
  it("lists the banks with their two-digit code", () => {
    expect(BANK_LIST.find((b) => b.value === "12")?.label).toMatch(/הפועלים.*12/);
  });
  it("a bank's branches, and a branch that belongs to another bank is refused", () => {
    expect(branchesOf("12")!.some((b) => b.code === "738")).toBe(true);
    expect(isKnownBranch("12", "738")).toBe(true);
    expect(isKnownBranch("12", "0738")).toBe(true);
    expect(isKnownBranch("12", "999")).toBe(false);
    expect(isKnownBranch("12", "abc")).toBe(false);
  });
  it("a bank the list does not cover takes any branch number", () => {
    expect(branchesOf("77")).toBeNull();
    expect(isKnownBranch("77", "123")).toBe(true);
  });
  it("search by number prefix, branch name or city", () => {
    const list = branchesOf("12")!;
    expect(searchBranches(list, "73").map((b) => b.code)).toEqual(["738"]);
    expect(searchBranches(list, "עלית").map((b) => b.code)).toEqual(["738"]);
    expect(searchBranches(list, "עפולה").map((b) => b.code).sort()).toEqual(["727", "738"]);
    expect(searchBranches(list, "פתח תקווה").map((b) => b.code)).toEqual(["616"]);
  });
});

const def = { version: 1, title: "t", pages: [{ id: "p1", title: "p", fields: [{ id: "acc", type: "bank_account", label: "חשבון בנק" }] }] } as unknown as FormDefinition;

describe("a bank account answer", () => {
  it("passes with a branch of the chosen bank", () => {
    expect(validateAnswers(def, { acc: { bank: "12", branch: "738", account: "123456" } }).errors.acc).toBeUndefined();
  });
  it("is refused with a branch that is not the bank's", () => {
    expect(validateAnswers(def, { acc: { bank: "12", branch: "800", account: "123456" } }).errors.acc).toMatch(/סניף/);
  });
});
