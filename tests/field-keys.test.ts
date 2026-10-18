import { describe, expect, it } from "vitest";
import { fieldKey, labelKey, sectionKey } from "@/lib/forms/field-keys";

describe("readable field ids", () => {
  it("knows the common form words", () => {
    expect(labelKey("שם פרטי")).toBe("firstName");
    expect(labelKey("שם משפחה")).toBe("lastName");
    expect(labelKey("מספר זהות ) 9 ספרות(")).toBe("idNumber");
    expect(labelKey("תאריך לידה")).toBe("birthDate");
    expect(labelKey("כתובת דואר אלקטרוני")).toBe("email");
    expect(labelKey("מספר טלפון נייד")).toBe("mobile");
    expect(labelKey("עיר/ישוב")).toBe("city");
    expect(labelKey("מיקוד")).toBe("zip");
    expect(labelKey("חתימת המבקש/ת")).toBe("signatureApplicant");
  });
  it("transliterates what it does not know", () => {
    expect(labelKey("קיבוץ")).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    expect(labelKey("(1)")).toBe("");
  });
  it("prefixes the section", () => {
    expect(sectionKey("ו. פרטים על בן/בת הזוג")).toBe("spouse");
    expect(sectionKey("א. פרטי המעסיק )למילוי ע\"י המעסיק(")).toBe("employer");
    expect(sectionKey("ב. פרטי העובד/ת")).toBe("employee");
    expect(fieldKey("שם פרטי", "ו. פרטים על בן/בת הזוג")).toBe("spouse_firstName");
    expect(fieldKey("שם", undefined)).toBe("name");
    expect(fieldKey("(1)", undefined, "")).toBe("");
  });
  it("always gives a valid id", () => {
    for (const l of ["שם", "כתובת פרטית", "חבר קיבוץ/מושב שיתופי", "מספר תיק ניכויים", "תושב ישראל"]) {
      expect(fieldKey(l, "ב. פרטי העובד/ת")).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*$/);
    }
  });
});
