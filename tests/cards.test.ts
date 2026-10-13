import { describe, expect, it } from "vitest";
import { buildCards, reviewItems } from "@/lib/forms/cards";
import { parseFormDefinition } from "@/lib/forms/schema";

const def = parseFormDefinition({
  schemaVersion: 1, title: "t", settings: { layout: "card" },
  pages: [
    { id: "a", title: "א", nextPage: [{ if: { field: "skip", op: "eq", value: "yes" }, goTo: "c" }], fields: [
      { id: "h", type: "heading", label: "פרטים" },
      { id: "name", type: "short_text", label: "שם" },
      { id: "skip", type: "yes_no", label: "לדלג?" },
      { id: "total", type: "number", label: "סה״כ", formula: "1+1" },
      { id: "note", type: "info_text", label: "תודה" },
    ] },
    { id: "b", title: "ב", fields: [{ id: "extra", type: "short_text", label: "נוסף" }] },
    { id: "c", title: "ג", fields: [{ id: "appr", type: "short_text", label: "מאשר", filledBy: "approver" }, { id: "last", type: "short_text", label: "אחרון", visibleIf: { field: "name", op: "notEmpty" } }] },
  ],
}).data!;

describe("card layout", () => {
  it("makes one card per editable question and attaches blocks to the next question", () => {
    const cards = buildCards(def, { name: "דנה" });
    expect(cards.map((c) => c.field?.id ?? null)).toEqual(["name", "skip", null, "extra", "appr", "last"]);
    expect(cards[0]!.blocks.map((b) => b.id)).toEqual(["h"]);
    expect(cards[2]!.blocks.map((b) => b.id)).toEqual(["note"]); // closing blocks of page a (formula field is not a card)
  });

  it("follows page jumps and hides conditional questions", () => {
    expect(buildCards(def, { skip: "yes" }).map((c) => c.field?.id ?? null)).toEqual(["name", "skip", null, "appr"]);
  });

  it("only offers the questions of the current role", () => {
    expect(buildCards(def, { name: "x" }, "approver").map((c) => c.field?.id).filter(Boolean)).toEqual(["appr"]);
  });

  it("lists answers for review", () => {
    const cards = buildCards(def, { name: "דנה", skip: "no" });
    expect(reviewItems(cards, { name: "דנה", skip: "no" }).slice(0, 2)).toEqual([
      { cardIndex: 0, label: "שם", text: "דנה" },
      { cardIndex: 1, label: "לדלג?", text: expect.stringContaining("לא") },
    ]);
  });
});
