import { describe, expect, it } from "vitest";
import { coerceRuleValue, fromRuleSet, toRuleSet } from "@/lib/forms/condition-ui";

describe("condition-ui", () => {
  it("round-trips leaf, all and any", () => {
    const leaf = { field: "a", op: "eq" as const, value: "x" };
    expect(toRuleSet(leaf)).toEqual({ mode: "all", rules: [leaf] });
    expect(fromRuleSet({ mode: "all", rules: [leaf] })).toEqual(leaf);
    const any = { any: [leaf, { field: "b", op: "empty" as const }] };
    const set = toRuleSet(any)!;
    expect(set.mode).toBe("any");
    expect(fromRuleSet(set)).toEqual(any);
    expect(toRuleSet({ all: [leaf, leaf] })!.rules).toHaveLength(2);
  });
  it("empty → undefined, and rules without a field are dropped", () => {
    expect(toRuleSet(undefined)).toEqual({ mode: "all", rules: [] });
    expect(fromRuleSet({ mode: "all", rules: [] })).toBeUndefined();
    expect(fromRuleSet({ mode: "all", rules: [{ field: "", op: "eq" }] })).toBeUndefined();
  });
  it("marks nested conditions as complex", () => {
    expect(toRuleSet({ not: { field: "a", op: "eq", value: 1 } })).toBeNull();
    expect(toRuleSet({ all: [{ any: [{ field: "a", op: "eq", value: 1 }] }] })).toBeNull();
  });
  it("drops the value for empty/notEmpty", () => {
    expect(fromRuleSet({ mode: "all", rules: [{ field: "a", op: "notEmpty", value: "zzz" }] })).toEqual({ field: "a", op: "notEmpty" });
  });
  it("coerces typed values", () => {
    expect(coerceRuleValue("gt", "5")).toBe(5);
    expect(coerceRuleValue("eq", "יש")).toBe("יש");
    expect(coerceRuleValue("in", "a, b ,c")).toEqual(["a", "b", "c"]);
  });
});
