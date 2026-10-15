import { describe, expect, it } from "vitest";
import { combText } from "@/lib/forms/pdf-mapping";
import { formatAnswer } from "@/lib/forms/format";
import type { FormField } from "@/lib/forms/schema";

const field = (type: FormField["type"]): FormField => ({ id: "f", type, label: "f" });

describe("comb boxes", () => {
  it("a date goes into 8 boxes as ddmmyyyy (the form prints the separators)", () => {
    const f = field("date");
    expect(combText(f, formatAnswer(f, "1990-11-01"))).toBe("01111990");
  });
  it("phone digits only; other text unchanged", () => {
    expect(combText(field("phone"), "050-1234567")).toBe("0501234567");
    expect(combText(field("id_number"), "000000018")).toBe("000000018");
    expect(combText(field("short_text"), "א/ב")).toBe("א/ב");
  });
});

describe("table answers as text", () => {
  it("one line per row with column labels, empty cells left out", () => {
    const table: FormField = { id: "kids", type: "repeating_table", label: "ילדים", fields: [
      { id: "name", type: "short_text", label: "שם" },
      { id: "birth", type: "date", label: "תאריך לידה" },
    ] };
    expect(formatAnswer(table, [{ name: "יואב", birth: "2015-03-02" }, { name: "מאיה" }, {}])).toBe("1. שם: יואב · תאריך לידה: 02/03/2015\n2. שם: מאיה");
    expect(formatAnswer(table, undefined)).toBe("");
  });
});
