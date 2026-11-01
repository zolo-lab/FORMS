import { describe, expect, it } from "vitest";
import { publicFillPath, publicStart, subjectFromAnswers } from "@/lib/forms/public-link";
import type { FormDefinition } from "@/lib/forms/schema";

const def = (fields: { id: string; type: string; label: string }[]) =>
  ({ schemaVersion: 1, title: "t", pages: [{ id: "p", title: "", fields }] }) as unknown as FormDefinition;

describe("form's public link", () => {
  it("is /f/<form id>", () => {
    expect(publicFillPath("abc")).toBe("/f/abc");
  });

  it("opens on the sender or the employee, not on someone else's step", () => {
    expect(publicStart([{ role: "requester" }, { role: "employee" }])).toEqual({ ok: true, role: "requester" });
    expect(publicStart([{ role: "employee" }, { role: "approver" }])).toEqual({ ok: true, role: "employee" });
    expect(publicStart([{ role: "approver" }])).toEqual({ ok: false, reason: "first_step_is_someone" });
    expect(publicStart([])).toEqual({ ok: false, reason: "no_steps" });
  });

  it("takes the employee from what was filled: e-mail, ID, phone and the name fields", () => {
    const d = def([
      { id: "fn", type: "short_text", label: "שם פרטי" },
      { id: "ln", type: "short_text", label: "שם משפחה" },
      { id: "org", type: "short_text", label: "שם העמותה" },
      { id: "mail", type: "email", label: "דוא\"ל עובד" },
      { id: "tz", type: "id_number", label: "ת\"ז" },
    ]);
    expect(subjectFromAnswers(d, { fn: "דנה", ln: "לוי", org: "פנימה", mail: "Dana@Example.test", tz: "000000018" }))
      .toEqual({ name: "דנה לוי", email: "dana@example.test", idNumber: "000000018" });
  });

  it("falls back to the e-mail as the name when there is no name field", () => {
    expect(subjectFromAnswers(def([{ id: "mail", type: "email", label: "דוא\"ל עובד" }]), { mail: "a@b.co" })).toEqual({ name: "a@b.co", email: "a@b.co" });
  });
});
