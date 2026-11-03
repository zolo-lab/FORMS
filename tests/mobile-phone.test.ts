import { describe, expect, it } from "vitest";
import { isValidIsraeliMobile } from "@/lib/validators/israeli";
import { validateAnswers } from "@/lib/forms/validate";
import type { FormDefinition } from "@/lib/forms/schema";

describe("Israeli mobile number", () => {
  it.each(["050-1234567", "0521234567", "+972 54 123 4567", "972-58-1234567", "055 123 4567"])("valid %s", (p) => expect(isValidIsraeliMobile(p)).toBe(true));
  it.each(["02-6234567", "077-1234567", "03-1234567", "050123456", "05012345678", "0601234567", ""])("invalid %s", (p) => expect(isValidIsraeliMobile(p)).toBe(false));
});

const def = (phoneKind?: "mobile"): FormDefinition => ({
  version: 1,
  title: "t",
  pages: [{ id: "p1", title: "p", fields: [{ id: "cell", type: "phone", label: "טלפון נייד", ...(phoneKind ? { validation: { phoneKind } } : {}) }] }],
}) as unknown as FormDefinition;

describe("a phone field marked mobile only", () => {
  it("refuses a landline", () => {
    expect(validateAnswers(def("mobile"), { cell: "02-6234567" }).errors.cell).toMatch(/נייד/);
  });
  it("accepts a mobile number", () => {
    expect(validateAnswers(def("mobile"), { cell: "050-1234567" }).errors.cell).toBeUndefined();
  });
  it("a plain phone field still accepts a landline", () => {
    expect(validateAnswers(def(), { cell: "02-6234567" }).errors.cell).toBeUndefined();
  });
});
