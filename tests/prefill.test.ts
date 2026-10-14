import { describe, expect, it } from "vitest";
import { withPrefill } from "@/lib/forms/prefill";
import type { FormDefinition } from "@/lib/forms/schema";

const def: FormDefinition = {
  schemaVersion: 1,
  title: "t",
  pages: [
    {
      id: "p",
      title: "",
      fields: [
        { id: "n", type: "full_name", label: "שם", prefill: "employee.name" },
        { id: "i", type: "id_number", label: "ת״ז", prefill: "employee.idNumber" },
        { id: "m", type: "email", label: "מייל", prefill: "employee.email" },
        { id: "ph", type: "phone", label: "טלפון", prefill: "employee.phone" },
        { id: "x", type: "short_text", label: "אחר", prefill: "employee.unknown" },
      ],
    },
  ],
};

describe("withPrefill", () => {
  const subject = { name: "ישראל בן דוד", idNumber: "123456782", email: "a@b.co", phone: null };

  it("fills from the subject and splits the name", () => {
    const a = withPrefill(def, subject, {});
    expect(a.n).toEqual({ first: "ישראל", last: "בן דוד" });
    expect(a.i).toBe("123456782");
    expect(a.m).toBe("a@b.co");
    expect(a.ph).toBeUndefined();
    expect(a.x).toBeUndefined();
  });

  it("never overwrites a stored answer", () => {
    const a = withPrefill(def, subject, { m: "mine@x.co" });
    expect(a.m).toBe("mine@x.co");
  });
});
