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

import { pipeDefinition, pipedIds } from "@/lib/forms/client-answers";
import { pipeText } from "@/lib/forms/piping";

describe("piping across roles", () => {
  const mine = {
    schemaVersion: 1, title: "t", settings: { layout: "single" },
    pages: [{ id: "p", title: "", fields: [{ id: "x", type: "info_text", label: "שלום {{firstName}}" }] }],
  } as unknown as FormDefinition;
  const full = {
    ...mine,
    pages: [{ id: "p", title: "", fields: [...mine.pages[0]!.fields, { id: "firstName", type: "short_text", label: "שם", filledBy: "requester" }, { id: "salary", type: "number", label: "שכר" }] }],
  } as unknown as FormDefinition;

  it("finds piped ids and keeps their answers", () => {
    expect([...pipedIds(mine)]).toEqual(["firstName"]);
    expect(answersForClient(mine, { firstName: "דנה", salary: 1 })).toEqual({ firstName: "דנה" });
  });
  it("lets the client format a field owned by another role", () => {
    const pd = pipeDefinition(mine, full);
    expect(pd.pages[0]!.fields.map((f) => f.id)).toEqual(["firstName"]);
    expect(pipeText("שלום {{firstName}}", { firstName: "דנה" }, { ...mine, pages: [...mine.pages, ...pd.pages] })).toBe("שלום דנה");
  });
});
