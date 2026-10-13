import { describe, expect, it } from "vitest";
import { mergedDefinitionForStep } from "@/lib/forms/merge";
import { roleView } from "@/lib/forms/role-view";
import type { FormDefinition } from "@/lib/forms/schema";

const doc = (title: string, pages: unknown[]) => ({ title, definition: { schemaVersion: 1, title, settings: { layout: "wizard" }, pages } as unknown as FormDefinition });
const f = (id: string, filledBy = "employee") => ({ id, type: "short_text", label: id, filledBy });

describe("jumps in merged documents", () => {
  it("'end' in document 1 continues with document 2", () => {
    const merged = mergedDefinitionForStep(
      [
        doc("A", [{ id: "a1", title: "a1", fields: [f("x")], nextPage: [{ if: { field: "x", op: "eq", value: "stop" }, goTo: "end" }] }, { id: "a2", title: "a2", fields: [f("y")] }]),
        doc("B", [{ id: "b1", title: "b1", fields: [f("z")] }]),
      ],
      "employee",
    );
    expect(merged.pages[0]!.nextPage![0]!.goTo).toBe("d1_b1");
  });
  it("'end' in the last document stays 'end'", () => {
    const merged = mergedDefinitionForStep([doc("A", [{ id: "a1", title: "a1", fields: [f("x")], nextPage: [{ if: { field: "x", op: "eq", value: "s" }, goTo: "end" }] }])], "employee");
    expect(merged.pages[0]!.nextPage![0]!.goTo).toBe("end");
  });
});

describe("roleView jump retargeting", () => {
  it("a jump into a page hidden from this role lands on the next shown page", () => {
    const def = {
      schemaVersion: 1, title: "t", settings: { layout: "wizard" },
      pages: [
        { id: "p1", title: "", fields: [f("a")], nextPage: [{ if: { field: "a", op: "eq", value: "1" }, goTo: "p2" }] },
        { id: "p2", title: "", fields: [f("b", "requester")] },
        { id: "p3", title: "", fields: [f("c")] },
      ],
    } as unknown as FormDefinition;
    const { definition } = roleView(def, {}, "employee");
    expect(definition.pages.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(definition.pages[0]!.nextPage![0]!.goTo).toBe("p3");
  });
});
