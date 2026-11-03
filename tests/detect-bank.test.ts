import { describe, expect, it } from "vitest";
import onboarding from "./fixtures/onboarding-pages.json";
import { detectFields, type DetectedField } from "@/lib/pdf/detect";
import type { GuessPage } from "@/lib/pdf/guess";
import { addDetectedFields } from "@/lib/forms/pdf-draw";
import type { FormDefinition } from "@/lib/forms/schema";

const fields = detectFields(onboarding as unknown as GuessPage[]);

describe("bank details: one 'bank account' field with a place per part", () => {
  const bank = fields.filter((f) => f.page === 3 && f.type === "bank_account");
  it("בנק / סניף / מס חשבון on the fund page are one field, not three texts", () => {
    expect(bank).toHaveLength(1);
    expect(fields.filter((f) => f.page === 3 && ["בנק", "סניף", "מס חשבון"].includes(f.label))).toEqual([]);
    expect(bank[0]!.parts!.map((p) => p.part).sort()).toEqual(["account", "bank", "branch"]);
  });
  it("the account holder's name stays its own field", () => {
    expect(fields.find((f) => f.page === 3 && f.label === "שם בעל החשבון")?.type).toBe("short_text");
  });
  it("Form 101's bank section is untouched when it has no bank fields", () => {
    expect(fields.filter((f) => f.page < 2 && f.type === "bank_account")).toEqual([]);
  });
  it("adding it makes one bank_account field with a stamp per part", () => {
    const def = { version: 1, title: "t", pages: [{ id: "p1", title: "p", fields: [] }] } as unknown as FormDefinition;
    let n = 0;
    const { definition, stamps } = addDetectedFields(def, bank as DetectedField[], [], () => `s${n++}`);
    const f = definition.pages[0]!.fields[0]!;
    expect(f.type).toBe("bank_account");
    expect(stamps.map((s) => s.part).sort()).toEqual(["account", "bank", "branch"]);
    expect(stamps.every((s) => s.fieldId === f.id)).toBe(true);
  });
});

describe("a mobile number", () => {
  it("a field named נייד is a phone that takes only a mobile number", () => {
    const cell = fields.find((f) => f.type === "phone" && /נייד/.test(f.label));
    expect(cell?.mobile).toBe(true);
    const def = { version: 1, title: "t", pages: [{ id: "p1", title: "p", fields: [] }] } as unknown as FormDefinition;
    const { definition } = addDetectedFields(def, [cell!], [], () => "s");
    expect(definition.pages[0]!.fields[0]!.validation?.phoneKind).toBe("mobile");
  });
});
