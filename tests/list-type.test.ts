import { describe, expect, it } from "vitest";
import { cleanTypeFields, displayKeyOf, renameKeyInType } from "@/lib/fields/list-type";

describe("list types", () => {
  it("keeps known fields once, in order", () => {
    expect(cleanTypeFields(["b", "a", "zzz", "b", 5, "c"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
    expect(cleanTypeFields("nope", ["a"])).toEqual([]);
  });

  it("names a record by the chosen field, else the first", () => {
    expect(displayKeyOf(["a", "b"], "b")).toBe("b");
    expect(displayKeyOf(["a", "b"], "gone")).toBe("a");
    expect(displayKeyOf([], "a")).toBeNull();
  });

  it("follows a renamed internal name", () => {
    expect(renameKeyInType({ fields: ["a", "b"], displayKey: "b" }, "b", "c")).toEqual({ fields: ["a", "c"], displayKey: "c" });
    expect(renameKeyInType({ fields: ["a"], displayKey: "a" }, "x", "y")).toBeNull();
  });
});
