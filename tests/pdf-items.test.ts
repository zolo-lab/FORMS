import { describe, expect, it } from "vitest";
import { orphanStamps, placeableItems, stampKey } from "@/lib/forms/pdf-items";
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
