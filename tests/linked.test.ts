import { describe, expect, it } from "vitest";
import { addLinkedField, allowedOptions, bindField, bindingOf, fits, linkReport, orgChoiceLookups, unbindField, withOrgOptions, type OrgListField } from "@/lib/forms/linked";
import type { FormDefinition, FormField } from "@/lib/forms/schema";
import { validateAnswers } from "@/lib/forms/validate";

const listFields: OrgListField[] = [
  { key: "__name", label: "שם", kind: "short_text", options: [], multi: false },
  { key: "__reg", label: 'ח"פ', kind: "id_number", options: [], multi: false },
  { key: "tyk", label: "תיק ניכויים", kind: "number", options: [], multi: false },
  { key: "dkg", label: "סוג פעילות", kind: "select", options: ["פעילות", "שכר מלמדים", "משרדיות"], multi: true },
  { key: "zone", label: "אזור", kind: "select", options: ["צפון", "דרום"], multi: false },
];

const form = (fields: FormField[]): FormDefinition => ({ schemaVersion: 1, title: "t", pages: [{ id: "p", title: "", fields }] });

describe("allowedOptions", () => {
  it("is what the record picked, in the field's order", () => {
    expect(allowedOptions(listFields[3]!, "שכר מלמדים, פעילות")).toEqual(["פעילות", "שכר מלמדים"]);
  });
  it("falls back to every option when nothing was picked (a gap to fix, not a dead end)", () => {
    expect(allowedOptions(listFields[3]!, "")).toEqual(["פעילות", "שכר מלמדים", "משרדיות"]);
    expect(allowedOptions(listFields[3]!, undefined)).toEqual(["פעילות", "שכר מלמדים", "משרדיות"]);
  });
  it("ignores picks no longer among the options", () => {
    expect(allowedOptions(listFields[4]!, "מרכז")).toEqual(["צפון", "דרום"]);
  });
});

describe("binding", () => {
  it("a text field is filled from the organization; a choice field takes its options from it", () => {
    let def = form([
      { id: "a", type: "short_text", label: "שם העמותה" },
      { id: "b", type: "checkboxes", label: "פעילות", options: [{ value: "o1", label: "x" }] },
    ]);
    def = bindField(def, "a", listFields[0]!);
    def = bindField(def, "b", listFields[3]!);
    const [a, b] = def.pages[0]!.fields;
    expect(a!.prefill).toBe("org.name");
    expect(b!.optionsSource).toBe("org.fields.dkg");
    expect(b!.options?.map((o) => o.value)).toEqual(["פעילות", "שכר מלמדים", "משרדיות"]);
    expect(bindingOf(a!)).toBe("__name");
    expect(bindingOf(b!)).toBe("dkg");
    const plain = unbindField(def, "b").pages[0]!.fields[1]!;
    expect(plain.optionsSource).toBeUndefined();
    expect(bindingOf(plain)).toBeUndefined();
  });

  it("reads the existing org prefills as bindings (forms built before)", () => {
    expect(bindingOf({ id: "org_name", type: "short_text", label: "x" } as FormField)).toBe("__name");
    expect(bindingOf({ id: "x", type: "short_text", label: "x", prefill: "org.registrationNumber" } as FormField)).toBe("__reg");
    expect(bindingOf({ id: "x", type: "short_text", label: "x", prefill: "org.fields.tyk" } as FormField)).toBe("tyk");
  });

  it("adds a missing field of a fitting type, already bound", () => {
    const { def, id } = addLinkedField(form([{ id: "tyk", type: "short_text", label: "אחר" }]), listFields[3]!, 0);
    const f = def.pages[0]!.fields.find((x) => x.id === id)!;
    expect(f.type).toBe("checkboxes");
    expect(f.label).toBe("סוג פעילות");
    expect(bindingOf(f)).toBe("dkg");
    const { def: d2, id: id2 } = addLinkedField(def, listFields[2]!, 0);
    expect(id2).not.toBe("tyk");
    expect(d2.pages[0]!.fields.find((x) => x.id === id2)!.type).toBe("number");
  });
});

describe("fits", () => {
  it("offers only fields that hold one plain value – never a stamp, a grid or a signature", () => {
    for (const type of ["stamp", "grid", "signature", "repeating_table", "consent", "rating"] as const) expect(fits({ type }, listFields[0]!)).toBe(false);
    expect(fits({ type: "short_text" }, listFields[0]!)).toBe(true);
    expect(fits({ type: "dropdown" }, listFields[0]!)).toBe(false);
    expect(fits({ type: "dropdown" }, listFields[4]!)).toBe(true);
    // A typed field takes only a value of its own kind: no free text into an e-mail or an ID number.
    expect(fits({ type: "email" }, listFields[0]!)).toBe(false);
    expect(fits({ type: "id_number" }, listFields[1]!)).toBe(true);
    expect(fits({ type: "number" }, listFields[2]!)).toBe(true);
    expect(fits({ type: "short_text" }, listFields[2]!)).toBe(true);
  });
});

describe("unbindField", () => {
  it("never renames: org_name stays linked by its id; others keep their id", () => {
    const def = form([{ id: "org_name", type: "short_text", label: "שם" }, { id: "x", type: "short_text", label: "y", prefill: "org.fields.tyk" }]);
    expect(unbindField(def, "org_name")).toBe(def);
    // Nor is it linked to anything else.
    expect(bindField(def, "org_name", listFields[2]!)).toBe(def);
    const f = unbindField(def, "x").pages[0]!.fields[1]!;
    expect(f.id).toBe("x");
    expect(f.prefill).toBeUndefined();
  });
});

describe("reserved ids", () => {
  it("an organization field whose key is org_name or constructor still gets a linkable id of its own", () => {
    for (const key of ["org_name", "org-number", "constructor"]) {
      const lf = { key, label: "x", kind: "short_text", options: [], multi: false };
      const { def, id } = addLinkedField(form([]), lf, 0);
      expect(["org_name", "org_number"]).not.toContain(id);
      expect(bindingOf(def.pages[0]!.fields[0]!)).toBe(key);
    }
    expect(bindingOf({ id: "constructor", type: "short_text", label: "x" } as FormField)).toBeUndefined();
  });
});

describe("linkReport", () => {
  it("finds what is bound, what matches by name, and what the form lacks", () => {
    const def = form([
      { id: "a", type: "short_text", label: "שם", prefill: "org.name" },
      { id: "b", type: "short_text", label: " ח״פ " },
      { id: "c", type: "dropdown", label: "אזור", options: [] },
      { id: "d", type: "signature", label: "תיק ניכויים" },
    ]);
    const r = linkReport(def, listFields);
    expect(r.find((x) => x.field.key === "__name")).toMatchObject({ state: "bound", formFieldIds: ["a"] });
    expect(r.find((x) => x.field.key === "__reg")).toMatchObject({ state: "suggested", suggestion: "b" });
    expect(r.find((x) => x.field.key === "zone")).toMatchObject({ state: "suggested", suggestion: "c" });
    // A signature cannot hold a number: no suggestion.
    expect(r.find((x) => x.field.key === "tyk")).toMatchObject({ state: "missing" });
    expect(r.find((x) => x.field.key === "dkg")).toMatchObject({ state: "missing" });
  });
});

describe("withOrgOptions", () => {
  const def = form([{ id: "b", type: "checkboxes", label: "פעילות", optionsSource: "org.fields.dkg", options: [] }]);
  it("narrows a bound choice to the organization's picks and checks answers against them", () => {
    const narrowed = withOrgOptions(def, { dkg: "פעילות, שכר מלמדים" }, listFields);
    const f = narrowed.pages[0]!.fields[0]!;
    expect(f.optionsSource).toBeUndefined();
    expect(f.options?.map((o) => o.label)).toEqual(["פעילות", "שכר מלמדים"]);
    expect(validateAnswers(narrowed, { b: ["משרדיות"] }).ok).toBe(false);
    expect(validateAnswers(narrowed, { b: ["פעילות"] }).ok).toBe(true);
  });
  it("offers every option without an organization, and none for a field that was deleted", () => {
    expect(withOrgOptions(def, null, listFields).pages[0]!.fields[0]!.options).toHaveLength(3);
    const gone = withOrgOptions(form([{ id: "z", type: "dropdown", label: "x", optionsSource: "org.fields.nope" }]), null, listFields);
    expect(gone.pages[0]!.fields[0]!.options).toEqual([]);
  });
});

describe("orgChoiceLookups", () => {
  it("gives the wizard every option, plus each organization's own", () => {
    const def = form([{ id: "b", type: "dropdown", label: "x", optionsSource: "org.fields.zone" }]);
    const l = orgChoiceLookups([def], [{ id: "o1", fieldValues: { zone: "דרום" } }, { id: "o2", fieldValues: {} }], listFields);
    expect(l["org.fields.zone"]!.map((o) => o.value)).toEqual(["צפון", "דרום"]);
    expect(l["org.fields.zone@o1"]!.map((o) => o.value)).toEqual(["דרום"]);
    expect(l["org.fields.zone@o2"]!.map((o) => o.value)).toEqual(["צפון", "דרום"]);
  });
});

describe("withOrgFields", () => {
  it("leaves out an organization value the locked field would refuse", async () => {
    const { withOrgFields } = await import("@/lib/forms/prefill");
    const def = form([
      { id: "m", type: "email", label: "מייל", prefill: "org.fields.mail" },
      { id: "t", type: "short_text", label: "תיק", prefill: "org.fields.tyk" },
    ]);
    const out = withOrgFields(def, { name: "x", fields: { mail: "a@b.c", tyk: "123" } }, { m: "typed@x.co" });
    expect(out.m).toBeUndefined();
    // Explicitly empty, so merged over a saved draft it still wins.
    expect("m" in out).toBe(true);
    expect({ ...{ m: "bad@x" }, ...out }.m).toBeUndefined();
    expect(out.t).toBe("123");
    expect(withOrgFields(def, { name: "x", fields: { mail: "office@org.co.il" } }, {}).m).toBe("office@org.co.il");
  });
});
