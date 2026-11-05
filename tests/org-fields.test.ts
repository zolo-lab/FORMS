import { describe, expect, it } from "vitest";
import { orgFieldKeyFromLabel } from "@/lib/orgs/field-key";
import { ORG_FIELD_PREFIX, isOrgField, lockOrgFields, orgFieldKey, prefillKeys, takesOrgField, withOrgFields, withPrefill } from "@/lib/forms/prefill";
import type { FormDefinition } from "@/lib/forms/schema";

const TIK = orgFieldKeyFromLabel("מספר תיק ניכויים");

const def = {
  schemaVersion: 1,
  title: "101",
  pages: [{ id: "p1", title: "", fields: [
    { id: "tik", type: "short_text", label: "תיק ניכויים", prefill: `${ORG_FIELD_PREFIX}${TIK}` },
    { id: "fname", type: "short_text", label: "שם פרטי", prefill: "employee.firstName" },
  ] }],
} as unknown as FormDefinition;

const org = { name: "שיבת ציון", registrationNumber: "580556306", fields: { [TIK]: "9123456" } };

describe("the key of an organization field", () => {
  it("is stable for the same label and different for another", () => {
    expect(orgFieldKeyFromLabel("מספר תיק ניכויים")).toBe(TIK);
    expect(orgFieldKeyFromLabel("  מספר   תיק ניכויים  ")).toBe(TIK);
    expect(orgFieldKeyFromLabel("מספר חוזה")).not.toBe(TIK);
  });

  it("is usable as a form key", () => {
    expect(orgFieldKeyFromLabel("Deduction File")).toMatch(/^[a-z0-9_]+$/);
    expect(TIK).toMatch(/^[a-z0-9_]+$/);
  });
});

describe("an organization field in a form", () => {
  it("fills itself from the organization of the request and is read-only", () => {
    expect(isOrgField(def.pages[0]!.fields[0]!)).toBe(true);
    expect(withOrgFields(def, org, {})).toEqual({ tik: "9123456" });
    const locked = lockOrgFields(def);
    expect(locked.pages[0]!.fields[0]!.readOnly).toBe(true);
    expect(locked.pages[0]!.fields[1]!.readOnly).toBeUndefined();
  });

  it("overwrites whatever a signer sent for it", () => {
    expect(withOrgFields(def, org, { tik: "מה שרוצים" })).toEqual({ tik: "9123456" });
  });

  it("is left empty for an organization that has no value for it", () => {
    expect(withOrgFields(def, { name: "אחרת", registrationNumber: "1", fields: {} }, { tik: "ישן" })).toEqual({});
    expect(withPrefill(def, { name: "דנה כהן", org: { name: "אחרת", registrationNumber: "1", fields: {} } }, {}).tik).toBeUndefined();
  });

  it("does not touch the employee's own fields", () => {
    expect(withOrgFields(def, org, { fname: "דנה" })).toEqual({ fname: "דנה", tik: "9123456" });
  });
});

describe("the builder's prefill list", () => {
  it("offers the organizations' fields after the fixed ones", () => {
    const keys = prefillKeys([{ key: TIK, label: "מספר תיק ניכויים" }]);
    expect(keys.some((k) => k.key === "employee.name")).toBe(true);
    const mine = keys.find((k) => k.key === `${ORG_FIELD_PREFIX}${TIK}`);
    expect(mine?.label).toContain("מספר תיק ניכויים");
    expect(orgFieldKey(mine!.key)).toBe(TIK);
  });

  it("without any organization field it is the fixed list", () => {
    expect(prefillKeys()).toHaveLength(prefillKeys([]).length);
    expect(orgFieldKey("employee.name")).toBeUndefined();
  });
});

describe("where an organization field may be used", () => {
  it("is not offered for answers that are not one line of text", () => {
    const mine = [{ key: TIK, label: "מספר תיק ניכויים" }];
    expect(prefillKeys(mine, "short_text").some((k) => k.key.startsWith(ORG_FIELD_PREFIX))).toBe(true);
    for (const t of ["full_name", "address", "bank_account", "radio_grid", "repeating_table", "signature", "file_upload"]) {
      expect(prefillKeys(mine, t).some((k) => k.key.startsWith(ORG_FIELD_PREFIX))).toBe(false);
      expect(takesOrgField(t)).toBe(false);
    }
  });

  it("without a type the whole list is offered (an old caller)", () => {
    expect(prefillKeys([{ key: TIK, label: "א" }]).some((k) => k.key.startsWith(ORG_FIELD_PREFIX))).toBe(true);
  });
});
