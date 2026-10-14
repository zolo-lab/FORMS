import { describe, expect, it } from "vitest";
import {
  addField, addPage, blankForm, duplicateField, findLocation, movePage, moveField, parseOptionsText,
  pickerLabels, publishIssues, removeField, removePage, renameFieldId, uniqueId, updateField,
} from "@/lib/forms/builder";
import { FIELD_TYPES } from "@/lib/forms/field-types";
import { parseFormDefinition } from "@/lib/forms/schema";
import { sampleForm } from "./fixtures/sample-form";

describe("builder: fields", () => {
  it("adds every one of the 29 field types and the result stays schema-valid", () => {
    let def = blankForm();
    for (const t of FIELD_TYPES) def = addField(def, t, { page: 0, index: 999 }).def;
    expect(def.pages[0]!.fields).toHaveLength(FIELD_TYPES.length);
    const ids = def.pages[0]!.fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(parseFormDefinition(def).success).toBe(true);
  });

  it("generates unique ids", () => {
    expect(uniqueId("short_text", new Set(["short_text", "short_text_2"]))).toBe("short_text_3");
    expect(uniqueId("שם", new Set())).toBe("field");
    expect(uniqueId("1abc", new Set())).toBe("abc");
  });

  it("removes, duplicates and updates", () => {
    let def = blankForm();
    const a = addField(def, "short_text", { page: 0, index: 0 });
    def = a.def;
    const dup = duplicateField(def, a.id);
    expect(dup.def.pages[0]!.fields.map((f) => f.id)).toEqual([a.id, dup.id]);
    expect(dup.def.pages[0]!.fields[1]!.label).toContain("עותק");
    const upd = updateField(dup.def, a.id, { label: "שם פרטי", required: true });
    expect(upd.pages[0]!.fields[0]).toMatchObject({ label: "שם פרטי", required: true });
    expect(updateField(upd, a.id, { required: undefined }).pages[0]!.fields[0]!.required).toBeUndefined();
    expect(removeField(upd, a.id).pages[0]!.fields.map((f) => f.id)).toEqual([dup.id]);
    expect(def.pages[0]!.fields).toHaveLength(1); // original untouched
  });

  it("moves fields within and across pages", () => {
    let def = addPage(blankForm());
    const ids: string[] = [];
    for (const t of ["short_text", "email", "phone"] as const) {
      const r = addField(def, t, { page: 0, index: 99 });
      def = r.def;
      ids.push(r.id);
    }
    def = moveField(def, ids[0]!, { page: 0, index: 3 }); // to the end
    expect(def.pages[0]!.fields.map((f) => f.id)).toEqual([ids[1], ids[2], ids[0]]);
    def = moveField(def, ids[2]!, { page: 1, index: 0 });
    expect(def.pages[1]!.fields.map((f) => f.id)).toEqual([ids[2]]);
    expect(def.pages[0]!.fields.map((f) => f.id)).toEqual([ids[1], ids[0]]);
    expect(findLocation(def, ids[2]!)).toEqual({ page: 1, index: 0 });
  });
});

describe("builder: ids and conditions", () => {
  it("renaming a field id updates every condition that references it", () => {
    const r = renameFieldId(sampleForm, "maritalStatus", "marital");
    expect(r.error).toBeUndefined();
    const spouse = r.def.pages[0]!.fields.find((f) => f.id === "spouseName")!;
    expect(spouse.visibleIf).toEqual({ field: "marital", op: "eq", value: "married" });
    expect(spouse.requiredIf).toEqual({ field: "marital", op: "eq", value: "married" });
    expect(publishIssues(r.def)).toEqual([]);
  });

  it("rejects duplicate or malformed ids", () => {
    expect(renameFieldId(sampleForm, "firstName", "lastName").error).toBeTruthy();
    expect(renameFieldId(sampleForm, "firstName", "שם").error).toBeTruthy();
    expect(renameFieldId(sampleForm, "firstName", "9x").error).toBeTruthy();
  });
});

describe("builder: pages", () => {
  it("adds, moves and removes pages; removing keeps the fields", () => {
    let def = addField(blankForm(), "short_text", { page: 0, index: 0 }).def;
    def = addPage(def);
    def = addField(def, "email", { page: 1, index: 0 }).def;
    expect(def.pages).toHaveLength(2);
    expect(movePage(def, 0, 1).pages[1]!.id).toBe(def.pages[0]!.id);
    const removed = removePage(def, 1);
    expect(removed.pages).toHaveLength(1);
    expect(removed.pages[0]!.fields).toHaveLength(2);
    expect(removePage(removed, 0).pages).toHaveLength(1); // never zero pages
  });
});

describe("builder: options", () => {
  it("parses pasted lines and keeps values of unchanged labels", () => {
    const existing = [{ value: "a", label: "חיפה" }, { value: "b", label: "אילת" }];
    const out = parseOptionsText("חיפה\n\n  תל אביב \nאילת", existing);
    expect(out.map((o) => o.label)).toEqual(["חיפה", "תל אביב", "אילת"]);
    expect(out[0]!.value).toBe("a");
    expect(out[2]!.value).toBe("b");
    expect(new Set(out.map((o) => o.value)).size).toBe(3);
  });

  it("a renamed option keeps its value (PDF marks and conditions keep working)", () => {
    const existing = [{ value: "o1", label: "אפשרות 1" }, { value: "o2", label: "אפשרות 2" }];
    expect(parseOptionsText("זכר\nנקבה", existing)).toEqual([{ value: "o1", label: "זכר" }, { value: "o2", label: "נקבה" }]);
    const grown = parseOptionsText("זכר\nנקבה\nאחר", [{ value: "o1", label: "זכר" }, { value: "o2", label: "נקבה" }]);
    expect(grown.map((o) => o.value)).toEqual(["o1", "o2", "o3"]);
    // Removing the first line does not hand its value to the next one.
    expect(parseOptionsText("נקבה", [{ value: "o1", label: "זכר" }, { value: "o2", label: "נקבה" }])).toEqual([{ value: "o2", label: "נקבה" }]);
  });
});

describe("builder: publish checks", () => {
  it("passes the sample form", () => {
    expect(publishIssues(sampleForm)).toEqual([]);
  });
  it("flags empty pages, dangling conditions, self-dependency and empty options", () => {
    let def = addPage(sampleForm);
    def = updateField(def, "spouseName", { visibleIf: { field: "ghost", op: "eq", value: 1 } });
    def = updateField(def, "firstName", { visibleIf: { field: "firstName", op: "notEmpty" } });
    def = updateField(def, "maritalStatus", { options: [] });
    const msgs = publishIssues(def).map((i) => i.message).join("|");
    expect(msgs).toContain("עמוד ריק");
    expect(msgs).toContain("ghost");
    expect(msgs).toContain("תלוי בעצמו");
    expect(msgs).toContain("אין אפשרויות");
  });
  it("reports schema errors", () => {
    expect(publishIssues({ ...blankForm(), pages: [] } as never).length).toBeGreaterThan(0);
  });
});

describe("pickerLabels", () => {
  it("adds the id only when labels collide", () => {
    const m = pickerLabels([{ id: "a", label: "מספר" }, { id: "b", label: "מספר" }, { id: "c", label: "שם" }, { id: "d", label: " " }]);
    expect(m.get("a")).toBe("מספר (a)");
    expect(m.get("b")).toBe("מספר (b)");
    expect(m.get("c")).toBe("שם");
    expect(m.get("d")).toBe("d");
  });
});
