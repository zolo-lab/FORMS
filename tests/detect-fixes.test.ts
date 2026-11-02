import { describe, expect, it } from "vitest";
import { findField, parseFormDefinition, type FormDefinition } from "@/lib/forms/schema";
import type { PdfStamp } from "@/lib/forms/pdf-mapping";
import { boxSwitchTargets, moveOption, optionMoveTargets, switchBoxType } from "@/lib/forms/detect-fixes";
import { evaluateCondition } from "@/lib/forms/conditions";
import { pruneStamps } from "@/lib/forms/pdf-items";
import { validateAnswers } from "@/lib/forms/validate";

const def = (fields: unknown[]): FormDefinition => parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p", title: "", fields }] }).data!;
let n = 0;
const stamp = (fieldId: string, kind: PdfStamp["kind"], extra: Partial<PdfStamp> = {}): PdfStamp => ({ id: `s${n++}`, fieldId, kind, page: 0, x: 10, y: 10, width: 20, height: 10, ...extra });

// What detection made of Form 101 (2.11.2026).
const form = def([
  { id: "employee_gender", type: "radio", label: "מין", options: [{ label: "זכר", value: "o1" }, { label: "רווק/ה", value: "o2" }, { label: "נשוי/אה", value: "o3" }] },
  { id: "employee_maritalStatus", type: "radio", label: "מצב משפחתי", options: [{ label: "נקבה", value: "o1" }, { label: "אלמן/ה", value: "o2" }] },
  { id: "kidsBox", type: "consent", label: "בגין ילדיי שבחזקתי" },
  { id: "exemption_numberChildren", type: "consent", label: "מספר ילדים שנולדו בשנת המס", required: true, visibleIf: { field: "kidsBox", op: "eq", value: true } },
  { id: "spouse", type: "short_text", label: "שם בן/בת הזוג", visibleIf: { field: "employee_gender", op: "eq", value: "o3" } },
  { id: "after", type: "short_text", label: "פרט", visibleIf: { field: "exemption_numberChildren", op: "eq", value: true } },
]);
const stamps = [
  stamp("employee_gender", "check", { whenValue: "o1" }),
  stamp("employee_gender", "check", { whenValue: "o2" }),
  stamp("employee_gender", "check", { whenValue: "o3" }),
  stamp("employee_maritalStatus", "check", { whenValue: "o1" }),
  stamp("employee_maritalStatus", "check", { whenValue: "o2" }),
  stamp("exemption_numberChildren", "check"),
];

describe("switchBoxType", () => {
  it("a tick box becomes a number: the X box becomes a writing box", () => {
    const r = switchBoxType(form, stamps, "exemption_numberChildren", "number");
    expect(r.error).toBeUndefined();
    expect(findField(r.def!, "exemption_numberChildren")!.type).toBe("number");
    expect(r.stamps!.find((s) => s.fieldId === "exemption_numberChildren")!.kind).toBe("text");
    expect(r.stamps!.filter((s) => s.fieldId === "employee_gender").every((s) => s.kind === "check")).toBe(true);
  });
  it("keeps the field's own condition and required; 'is ticked' rules about it become 'is filled'", () => {
    const r = switchBoxType(form, stamps, "exemption_numberChildren", "number");
    const f = findField(r.def!, "exemption_numberChildren")!;
    expect(f.required).toBe(true);
    expect(f.visibleIf).toEqual({ field: "kidsBox", op: "eq", value: true });
    expect(findField(r.def!, "after")!.visibleIf).toEqual({ field: "exemption_numberChildren", op: "notEmpty" });
    expect(evaluateCondition(findField(r.def!, "after")!.visibleIf, { exemption_numberChildren: 2 })).toBe(true);
  });
  it("a number is accepted and validated as a number after the switch", () => {
    const r = switchBoxType(form, stamps, "exemption_numberChildren", "number");
    expect(validateAnswers(r.def!, { kidsBox: true, exemption_numberChildren: 2 }).ok).toBe(true);
    expect(validateAnswers(r.def!, { kidsBox: true, exemption_numberChildren: "abc" }).ok).toBe(false);
  });
  it("and back: a writing box becomes an X, cells included", () => {
    const one = switchBoxType(form, stamps, "exemption_numberChildren", "number");
    const cells = one.stamps!.map((s) => (s.fieldId === "exemption_numberChildren" ? { ...s, kind: "comb" as const, comb: { cells: 2 } } : s));
    const back = switchBoxType(one.def!, cells, "exemption_numberChildren", "consent");
    const st = back.stamps!.find((s) => s.fieldId === "exemption_numberChildren")!;
    expect(st.kind).toBe("check");
    expect(st.comb).toBeUndefined();
    expect(findField(back.def!, "after")!.visibleIf).toEqual({ field: "exemption_numberChildren", op: "eq", value: true });
  });
  it("refuses switches it cannot do", () => {
    expect(switchBoxType(form, stamps, "employee_gender", "number").error).toBeDefined();
    expect(switchBoxType(form, stamps, "nope", "number").error).toBeDefined();
    expect(boxSwitchTargets("consent")).toContain("number");
    expect(boxSwitchTargets("short_text")).toEqual(["consent"]);
    expect(boxSwitchTargets("radio")).toEqual([]);
  });
});

describe("moveOption", () => {
  it("moves the option and its X to the other field, with a value free there", () => {
    const r = moveOption(form, stamps, "employee_maritalStatus", "o1", "employee_gender");
    expect(r.error).toBeUndefined();
    expect(findField(r.def!, "employee_maritalStatus")!.options!.map((o) => o.label)).toEqual(["אלמן/ה"]);
    expect(findField(r.def!, "employee_gender")!.options!.map((o) => `${o.label}=${o.value}`)).toEqual(["זכר=o1", "רווק/ה=o2", "נשוי/אה=o3", "נקבה=o4"]);
    const x = r.stamps!.filter((s) => s.fieldId === "employee_gender").map((s) => s.whenValue);
    expect(x).toEqual(["o1", "o2", "o3", "o4"]);
    expect(r.stamps!.filter((s) => s.fieldId === "employee_maritalStatus").map((s) => s.whenValue)).toEqual(["o2"]);
  });
  it("rules that tested the option follow it to the new field", () => {
    const r = moveOption(form, stamps, "employee_gender", "o3", "employee_maritalStatus");
    const spouse = findField(r.def!, "spouse")!.visibleIf;
    expect(spouse).toEqual({ field: "employee_maritalStatus", op: "eq", value: "o3" });
    expect(evaluateCondition(spouse, { employee_maritalStatus: "o3" })).toBe(true);
  });
  it("the whole 101 mix-up can be undone option by option", () => {
    let cur = { def: form, stamps };
    for (const [from, value, to] of [
      ["employee_gender", "o2", "employee_maritalStatus"],
      ["employee_gender", "o3", "employee_maritalStatus"],
      ["employee_maritalStatus", "o1", "employee_gender"],
    ] as const) {
      const r = moveOption(cur.def, cur.stamps, from, value, to);
      cur = { def: r.def!, stamps: r.stamps! };
    }
    expect(findField(cur.def, "employee_gender")!.options!.map((o) => o.label)).toEqual(["זכר", "נקבה"]);
    expect(findField(cur.def, "employee_maritalStatus")!.options!.map((o) => o.label)).toEqual(["אלמן/ה", "רווק/ה", "נשוי/אה"]);
    expect(cur.stamps.filter((s) => s.kind === "check" && s.whenValue).length).toBe(5);
    // Nothing becomes an orphan box (the editor would drop it on save).
    expect(pruneStamps(cur.def, cur.stamps)).toHaveLength(cur.stamps.length);
  });
  it("only to a choice field with a hand-written list", () => {
    expect(optionMoveTargets(form, "employee_gender").map((f) => f.id)).toEqual(["employee_maritalStatus"]);
    expect(moveOption(form, stamps, "employee_gender", "o1", "spouse").error).toBeDefined();
    expect(moveOption(form, stamps, "employee_gender", "o9", "employee_maritalStatus").error).toBeDefined();
  });
});
