import { describe, expect, it } from "vitest";
import { guessRowPitch, replicateTableRow, tableCellOf } from "@/lib/forms/pdf-items";
import type { PdfStamp } from "@/lib/forms/pdf-mapping";

const st = (id: string, fieldId: string, y: number, extra: Partial<PdfStamp> = {}): PdfStamp => ({ id, fieldId, kind: "text", page: 0, x: 100, y, width: 60, height: 12, ...extra });

describe("printed table rows", () => {
  it("parses a cell id", () => {
    expect(tableCellOf("children[3].birth")).toEqual({ table: "children", row: 3, column: "birth" });
    expect(tableCellOf("name")).toBeNull();
  });

  it("repeats one row's cells on the next rows, pitch pt lower each", () => {
    const row = [st("a", "children[0].name", 440), st("b", "children[0].idn", 440, { kind: "comb", comb: { cells: 9 } })];
    let n = 0;
    const out = replicateTableRow(row, row, 3, 22, () => `n${++n}`);
    expect(out.map((s) => `${s.fieldId}@${s.y}`)).toEqual([
      "children[1].name@418", "children[1].idn@418",
      "children[2].name@396", "children[2].idn@396",
      "children[3].name@374", "children[3].idn@374",
    ]);
    expect(out[1]!.comb).toEqual({ cells: 9 });
  });

  it("skips cells already placed and refuses mixed selections", () => {
    const all = [st("a", "t[0].c", 100), st("b", "t[1].c", 80)];
    expect(replicateTableRow(all, [all[0]!], 2, 20, () => "x").map((s) => s.fieldId)).toEqual(["t[2].c"]);
    expect(replicateTableRow(all, all, 2, 20, () => "x")).toEqual([]);
    expect(replicateTableRow(all, [st("c", "plain", 10)], 2, 20, () => "x")).toEqual([]);
  });

  it("guesses the row distance from the next row when it is placed", () => {
    const all = [st("a", "t[0].c", 100), st("b", "t[1].c", 78)];
    expect(guessRowPitch(all, [all[0]!])).toBe(22);
    expect(guessRowPitch([all[0]!], [all[0]!])).toBe(18);
  });
});
