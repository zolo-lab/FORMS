import { describe, expect, it } from "vitest";
import { evaluateCondition } from "@/lib/forms/conditions";

describe("conditions on multiple-choice answers", () => {
  const answers = { exemptions: ["1", "3"], status: "married" };
  it("contains / eq match when the list includes the value", () => {
    expect(evaluateCondition({ field: "exemptions", op: "contains", value: "3" }, answers)).toBe(true);
    expect(evaluateCondition({ field: "exemptions", op: "eq", value: "3" }, answers)).toBe(true);
    expect(evaluateCondition({ field: "exemptions", op: "eq", value: "4" }, answers)).toBe(false);
    expect(evaluateCondition({ field: "exemptions", op: "neq", value: "4" }, answers)).toBe(true);
    expect(evaluateCondition({ field: "exemptions", op: "neq", value: "1" }, answers)).toBe(false);
  });
  it("single values behave as before", () => {
    expect(evaluateCondition({ field: "status", op: "eq", value: "married" }, answers)).toBe(true);
    expect(evaluateCondition({ field: "status", op: "neq", value: "married" }, answers)).toBe(false);
    expect(evaluateCondition({ field: "missing", op: "neq", value: "x" }, answers)).toBe(true);
  });
});
