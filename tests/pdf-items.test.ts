import { describe, expect, it } from "vitest";
import { orphanStamps, placeableItems, splitPlacement, stampKey } from "@/lib/forms/pdf-items";
import { sampleForm } from "./fixtures/sample-form";
import { parseFormDefinition } from "@/lib/forms/schema";
import type { PdfStamp } from "@/lib/forms/pdf-mapping";

describe("pdf placeable items", () => {
  const items = placeableItems(sampleForm, { children: 2 });
  const keys = items.map((i) => i.key);

  it("offers simple fields once, composite fields per part", () => {
    expect(keys).toContain("firstName||");
    expect(keys).toContain("address|city|");
    expect(keys).toContain("address|zip|");
    expect(keys).toContain("bank|account|");
    expect(keys).not.toContain("address||");
  });
  it("offers a check per option and per yes/no value", () => {
    expect(keys).toContain("maritalStatus||married");
    expect(keys).toContain("maritalStatus||");
    expect(keys).toContain("hasChildren||yes");
    expect(keys).toContain("incomeTypes||monthly");
    expect(items.find((i) => i.key === "declare||")!.kind).toBe("check");
    expect(items.find((i) => i.key === "sig||")!.kind).toBe("signature");
  });
  it("addresses table cells by row", () => {
    expect(keys).toContain("children[0].name||");
    expect(keys).toContain("children[1].birthDate||");
    expect(keys).not.toContain("children[2].name||");
  });
  it("skips layout blocks", () => {
    expect(keys.some((k) => k.startsWith("intro"))).toBe(false);
  });
  it("keys are unique", () => expect(new Set(keys).size).toBe(keys.length));
  it("finds orphan stamps after a field is removed", () => {
    const stamp = { id: "1", fieldId: "gone", kind: "text" as const, page: 0, x: 0, y: 0, width: 10, height: 10 };
    const ok = { id: "2", fieldId: "firstName", kind: "text" as const, page: 0, x: 0, y: 0, width: 10, height: 10 };
    const cell = { id: "3", fieldId: "children[7].name", kind: "text" as const, page: 0, x: 0, y: 0, width: 10, height: 10 };
    expect(orphanStamps(sampleForm, [stamp, ok, cell]).map((s) => s.id)).toEqual(["1"]);
    expect(stampKey(ok)).toBe("firstName||");
  });
});

describe("pending vs placed", () => {
  const items = placeableItems(sampleForm, {});
  const groups = [...items.reduce((m, it) => m.set(it.group, [...(m.get(it.group) ?? []), it]), new Map<string, typeof items>()).entries()];

  it("everything is pending until something is placed", () => {
    const r = splitPlacement(groups, new Set());
    expect(r.placed).toEqual([]);
    expect(r.pending).toHaveLength(groups.length);
  });
  it("a field moves to placed when all its items have a stamp", () => {
    const first = groups[0]!;
    const r = splitPlacement(groups, new Set(first[1].map((i) => i.key)));
    expect(r.placed.map((g) => g[0])).toEqual([first[0]]);
    expect(r.pending).toHaveLength(groups.length - 1);
  });
  it("a field with several parts stays pending while one is missing", () => {
    const multi = groups.find((g) => g[1].length > 1)!;
    const r = splitPlacement(groups, new Set(multi[1].slice(1).map((i) => i.key)));
    expect(r.pending.map((g) => g[0])).toContain(multi[0]);
    expect(r.placed.map((g) => g[0])).not.toContain(multi[0]);
  });
});

describe("the form and its PDF boxes stay one", () => {
  const box = { page: 0, x: 0, y: 0, width: 10, height: 10 };
  const def = parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p", title: "", fields: [
    { id: "name", type: "short_text", label: "שם" },
    { id: "kids", type: "repeating_table", label: "ילדים", fields: [{ id: "n", type: "short_text", label: "שם" }] },
  ] }] }).data!;
  it("drops the boxes of a field that was deleted, keeps document marks", async () => {
    const { pruneStamps } = await import("@/lib/forms/pdf-items");
    const stamps = [
      { id: "1", fieldId: "name", kind: "text", ...box },
      { id: "2", fieldId: "gone", kind: "text", ...box },
      { id: "3", fieldId: "kids[1].n", kind: "text", ...box },
      { id: "4", fieldId: "_date_signed", kind: "date_signed", ...box },
    ] as PdfStamp[];
    expect(pruneStamps(def, stamps).map((s) => s.id)).toEqual(["1", "3", "4"]);
  });
  it("reports fields whose last box was deleted", async () => {
    const { fieldsLeftWithoutStamps } = await import("@/lib/forms/pdf-items");
    const a = { id: "1", fieldId: "name", kind: "text", ...box } as PdfStamp;
    const b = { id: "2", fieldId: "name", kind: "text", ...box } as PdfStamp;
    const c = { id: "3", fieldId: "kids[0].n", kind: "text", ...box } as PdfStamp;
    const d = { id: "4", fieldId: "kids[1].n", kind: "text", ...box } as PdfStamp;
    expect(fieldsLeftWithoutStamps([a, b, c, d], [a, c])).toEqual([]);
    expect(fieldsLeftWithoutStamps([a, b, c, d], [c, d])).toEqual(["name"]);
    expect(fieldsLeftWithoutStamps([a, c], [a])).toEqual(["kids"]);
  });
});
