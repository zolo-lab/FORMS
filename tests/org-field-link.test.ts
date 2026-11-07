import { describe, expect, it } from "vitest";
import { linkToOrgField } from "@/lib/forms/prefill";
import type { FormDefinition } from "@/lib/forms/schema";

const def = (fields: { id: string; type?: string }[]): FormDefinition =>
  ({ version: 1, title: "t", settings: {}, pages: [{ id: "p1", title: "1", fields: fields.map((f) => ({ type: "short_text", label: f.id, ...f })) }] }) as unknown as FormDefinition;

describe("linkToOrgField", () => {
  it("names the field after the organization field and fills it from it", () => {
    const r = linkToOrgField(def([{ id: "pdf_text_2" }]), "pdf_text_2", "deductionsFile");
    expect(r.id).toBe("deductionsFile");
    expect(r.def!.pages[0]!.fields[0]).toMatchObject({ id: "deductionsFile", prefill: "org.fields.deductionsFile" });
  });

  it("turns a dash in the key into an underscore (field ids take no dash)", () => {
    expect(linkToOrgField(def([{ id: "a" }]), "a", "tax-file").id).toBe("tax_file");
  });

  it("a second field linked to the same organization field gets a number, and both fill from it", () => {
    const first = linkToOrgField(def([{ id: "a" }, { id: "b" }]), "a", "orgPhone");
    const second = linkToOrgField(first.def!, "b", "orgPhone");
    expect(second.id).toBe("orgPhone2");
    expect(second.def!.pages[0]!.fields.map((f) => f.prefill)).toEqual(["org.fields.orgPhone", "org.fields.orgPhone"]);
  });

  it("linking again to the same field keeps its name", () => {
    const once = linkToOrgField(def([{ id: "a" }]), "a", "orgPhone");
    expect(linkToOrgField(once.def!, "orgPhone", "orgPhone").id).toBe("orgPhone");
  });

  it("refuses a field type whose answer is not one line of text", () => {
    const r = linkToOrgField(def([{ id: "acc", type: "bank_account" }]), "acc", "orgPhone");
    expect(r.error).toBeTruthy();
    expect(r.def).toBeUndefined();
  });
});
