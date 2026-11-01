import { describe, expect, it } from "vitest";
import { copySourceInForm, copySourceOf, copyTargets, withCopies } from "@/lib/forms/copy";
import { validateAnswers } from "@/lib/forms/validate";
import type { FormDefinition, FormField } from "@/lib/forms/schema";

const form = (fields: FormField[]): FormDefinition => ({ schemaVersion: 1, title: "t", pages: [{ id: "p1", title: "", fields }] });
const text = (id: string, extra: Partial<FormField> = {}): FormField => ({ id, type: "short_text", label: id, ...extra });

describe("iForms value copy: an id that is another field's id plus a number copies that field", () => {
  const def = form([
    text("fname"), text("fname1"), text("fname2"),
    { id: "birthdate", type: "date", label: "" }, { id: "birthdate1", type: "date", label: "" },
    text("city"), { id: "city1", type: "long_text", label: "" },
    text("name_child1", { settings: { noCopy: true } }), text("name_child"),
    { id: "gender", type: "radio", label: "", options: [{ value: "1", label: "זכר" }] }, text("gender1"),
    text("tax_credit_1"),
  ]);

  it("finds the source by the id without its trailing number", () => {
    expect(copySourceOf(def.pages[0]!.fields[1]!, new Set(["fname"]))).toBe("fname");
    expect(copyTargets(def)).toEqual({ fname1: "fname", fname2: "fname", birthdate1: "birthdate", city1: "city" });
  });

  it("skips fields marked 'no copy', other kinds of value, and ids whose base is not a field", () => {
    const t = copyTargets(def);
    expect(t.name_child1).toBeUndefined();
    expect(t.gender1).toBeUndefined();
    expect(t.tax_credit_1).toBeUndefined();
  });

  it("fills an empty copy from its source, live", () => {
    expect(withCopies(def, { fname: "ישראל", birthdate: "1990-05-20" })).toMatchObject({ fname1: "ישראל", fname2: "ישראל", birthdate1: "1990-05-20" });
  });

  it("keeps a value the filler typed over the copy", () => {
    expect(withCopies(def, { fname: "ישראל", fname1: "Israel" }).fname1).toBe("Israel");
  });

  it("follows the source when the copy was never changed (an empty copy is not stored)", () => {
    expect(withCopies(def, { fname: "יוסי" }).fname1).toBe("יוסי");
    expect(withCopies(def, {})).toEqual({});
  });

  it("copies from an answer of an earlier step even when the source field is not in this step's form", () => {
    const mine = form([text("fname1")]);
    expect(withCopies(mine, { fname: "ישראל" }).fname1).toBe("ישראל");
    expect(withCopies(mine, {}).fname1).toBeUndefined();
  });

  it("returns the same object when nothing changes", () => {
    const a = { other: "x" };
    expect(withCopies(form([text("other")]), a)).toBe(a);
  });
});

describe("copies on the server and in the builder", () => {
  const def = form([text("fname", { required: true }), text("fname1", { required: true }), text("lname1", { settings: { noCopy: true } }), text("lname")]);

  it("the server stores the copy when the filler left it empty, and keeps a typed value", () => {
    expect(validateAnswers(def, { fname: "ישראל" }).cleaned.fname1).toBe("ישראל");
    expect(validateAnswers(def, { fname: "ישראל", fname1: "Israel" }).cleaned.fname1).toBe("Israel");
  });

  it("the builder names the source, also for a field with copying turned off", () => {
    expect(copySourceInForm(def, def.pages[0]!.fields[1]!)?.id).toBe("fname");
    expect(copySourceInForm(def, def.pages[0]!.fields[2]!)?.id).toBe("lname");
    expect(copySourceInForm(def, def.pages[0]!.fields[0]!)).toBeUndefined();
  });
});
