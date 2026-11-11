import { describe, expect, it } from "vitest";
import { cleanCell, cleanOptions, fillerTitle, listTitle, parentTitle, splitPicks, type ListField } from "@/lib/lists/kinds";

const f = (kind: ListField["kind"], extra: Partial<ListField> = {}): ListField => ({ key: "k", label: "ש", kind, ...extra });

describe("options of a choice field", () => {
  it("trims, drops empties and repeats, keeps the order", () => {
    expect(cleanOptions([" פעיל ", "", "מושהה", "פעיל", 3, "  "])).toEqual(["פעיל", "מושהה"]);
    expect(cleanOptions("לא מערך")).toEqual([]);
  });
});

describe("a cell", () => {
  it("text kinds are checked by their type, empty clears", () => {
    expect(cleanCell(f("email"), "a@b.co")).toEqual({ ok: true, value: "a@b.co" });
    expect(cleanCell(f("email"), "לא מייל").ok).toBe(false);
    expect(cleanCell(f("number"), "1,200")).toEqual({ ok: true, value: "1,200" });
    expect(cleanCell(f("short_text"), "   ")).toEqual({ ok: true, value: "" });
  });

  it("a single choice must be one of the options", () => {
    const sel = f("select", { options: ["פעיל", "מושהה"] });
    expect(cleanCell(sel, "פעיל")).toEqual({ ok: true, value: "פעיל" });
    expect(cleanCell(sel, "אחר").ok).toBe(false);
    expect(cleanCell(sel, "")).toEqual({ ok: true, value: "" });
  });

  it("a multiple choice keeps the options' order and refuses strangers", () => {
    const sel = f("select", { options: ["א", "ב", "ג"], multi: true });
    expect(cleanCell(sel, ["ג", "א"])).toEqual({ ok: true, value: ["א", "ג"] });
    expect(cleanCell(sel, ["א", "ד"]).ok).toBe(false);
    expect(cleanCell(sel, [])).toEqual({ ok: true, value: [] });
  });

  it("yes/no takes only yes or no", () => {
    expect(cleanCell(f("yes_no"), "yes")).toEqual({ ok: true, value: "yes" });
    expect(cleanCell(f("yes_no"), "maybe").ok).toBe(false);
  });

  it("'belongs to' must point at an existing list of the parent type", () => {
    const ids = new Set(["c1", "c2"]);
    expect(cleanCell(f("ref"), "c1", ids)).toEqual({ ok: true, value: "c1" });
    expect(cleanCell(f("ref"), "zz", ids).ok).toBe(false);
    expect(cleanCell(f("ref"), "", ids)).toEqual({ ok: true, value: "" });
  });
});

describe("a list's title", () => {
  it("is its first text value, skipping choices and links", () => {
    const fields = [f("ref", { key: "city" }), f("short_text", { key: "name" }), f("phone", { key: "tel" })];
    expect(listTitle({ city: "c1", name: "", tel: "050" }, fields)).toBe("050");
    expect(listTitle({ name: "בצלאל" }, fields)).toBe("בצלאל");
    expect(listTitle({}, fields)).toBe("ללא שם");
  });
});

describe("splitPicks", () => {
  it("reads several picks back, keeping an option that holds a comma", () => {
    expect(splitPicks("א, ב", ["א", "ב"])).toEqual(["א", "ב"]);
    expect(splitPicks("צפון, מרכז, דרום", ["צפון, מרכז", "דרום"])).toEqual(["צפון, מרכז", "דרום"]);
    expect(splitPicks("צפון, מרכז", ["צפון, מרכז"])).toEqual(["צפון, מרכז"]);
    expect(splitPicks("", ["א"])).toEqual([]);
    expect(splitPicks("ישן", ["א"])).toEqual(["ישן"]);
  });
});

describe("listTitle without a text value", () => {
  it("falls back to the first choice, then to ללא שם", () => {
    const fields = [{ key: "n", kind: "short_text" as const }, { key: "c", kind: "select" as const }];
    expect(listTitle({ c: ["א", "ב"] }, fields)).toBe("א, ב");
    expect(listTitle({}, fields)).toBe("ללא שם");
  });
});

describe("a record's title as a filler sees it", () => {
  const fields = [f("short_text", { key: "name" }), f("id_number", { key: "id" }), f("long_text", { key: "notes" }), f("select", { key: "veg", options: ["א"] })];
  const values = { name: "גדע ירקות", id: "123456782", notes: "אבחנה: רגיש", veg: ["א"] };
  it("is the first text field the form links to", () => {
    expect(fillerTitle(values, fields, new Set(["name", "notes"]))).toBe("גדע ירקות");
    expect(fillerTitle({ ...values, name: "" }, fields, new Set(["name", "notes"]))).toBe("אבחנה: רגיש");
  });
  it("never leaks a text field the form does not link – even the first one – nor an ID number or a choice", () => {
    expect(fillerTitle(values, fields, new Set())).toBeUndefined();
    expect(fillerTitle(values, fields, new Set(["id", "veg"]))).toBeUndefined();
    // The name field deleted: a diagnosis is now the first field, and still not shown unless linked.
    expect(fillerTitle(values, fields.slice(2), new Set(["veg"]))).toBeUndefined();
  });
});

describe("a parent record's title (for 'belongs to')", () => {
  it("is its first field when that is a short text, else nothing", () => {
    expect(parentTitle({ name: "צפון", notes: "סודי" }, [f("short_text", { key: "name" }), f("long_text", { key: "notes" })])).toBe("צפון");
    expect(parentTitle({ notes: "סודי", name: "צפון" }, [f("long_text", { key: "notes" }), f("short_text", { key: "name" })])).toBeUndefined();
    expect(parentTitle({ id: "123456782" }, [f("id_number", { key: "id" })])).toBeUndefined();
  });
});
