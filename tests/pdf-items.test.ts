import { describe, expect, it } from "vitest";
import { orphanStamps, placeableItems, splitPlacement, stampKey } from "@/lib/forms/pdf-items";
import { sampleForm } from "./fixtures/sample-form";

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
