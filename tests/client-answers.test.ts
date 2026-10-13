import { describe, expect, it } from "vitest";
import { answersForClient } from "@/lib/forms/client-answers";
import type { FormDefinition } from "@/lib/forms/schema";

const def = {
  schemaVersion: 1,
  title: "t",
  settings: { layout: "single" },
  pages: [
    {
      id: "p1",
      title: "p",
      fields: [
        { id: "mine", type: "short_text", label: "m" },
        { id: "shown", type: "short_text", label: "s", visibleIf: { field: "gate", op: "eq", value: "x" } },
        { id: "total", type: "number", label: "t", formula: "{a} + {b}" },
      ],
    },
  ],
} as unknown as FormDefinition;

describe("answersForClient", () => {
  it("keeps own fields and references, drops everything else", () => {
    const out = answersForClient(def, { mine: "1", gate: "x", a: 1, b: 2, salary: 99999, secret: "no" });
    expect(Object.keys(out).sort()).toEqual(["a", "b", "gate", "mine"]);
  });
});
