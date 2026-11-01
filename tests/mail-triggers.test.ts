import { describe, expect, it } from "vitest";
import { addPeople, effectiveTemplate, effectiveTrigger, parseEmailList, renderMessage, TRIGGERS, type TriggerSetting } from "@/lib/notifications/triggers";
import { DEFAULT_TEMPLATES } from "@/lib/notifications/templates";

const row = (o: Partial<TriggerSetting>): TriggerSetting => ({ organizationId: null, key: "completed", enabled: true, recipients: ["employee"], fixedRecipients: [], ...o });

describe("e-mail triggers", () => {
  it("every trigger has a default text and defaults within what it allows", () => {
    for (const t of TRIGGERS) {
      expect(DEFAULT_TEMPLATES[t.key], t.key).toBeDefined();
      for (const r of t.defaults) expect(t.allowed, t.key).toContain(r);
    }
  });

  it("without a stored setting the defaults apply", () => {
    expect(effectiveTrigger("completed", [], "org1")).toEqual({ key: "completed", enabled: true, recipients: ["employee", "creator"], fixedRecipients: [], source: "default" });
  });

  it("an organization's own setting wins over the all-organizations one", () => {
    const settings = [row({ enabled: false }), row({ organizationId: "org1", recipients: ["secretariat"] })];
    expect(effectiveTrigger("completed", settings, "org1")).toMatchObject({ enabled: true, recipients: ["secretariat"], source: "org" });
    expect(effectiveTrigger("completed", settings, "org2")).toMatchObject({ enabled: false, source: "all" });
  });

  it("drops recipients a trigger does not allow", () => {
    expect(effectiveTrigger("step_invite", [row({ key: "step_invite", recipients: ["signer", "bookkeeping"] })], null).recipients).toEqual(["signer"]);
  });

  it("the sign-in code can't be switched off or rewritten", () => {
    expect(effectiveTrigger("otp", [row({ key: "otp", enabled: false })], null)).toMatchObject({ enabled: true, source: "default" });
    expect(effectiveTemplate("otp", [{ organizationId: null, key: "otp", subject: "x", body: "y" }], null).source).toBe("default");
  });

  it("text: organization, then all organizations, then the built-in one", () => {
    const rows = [
      { organizationId: null, key: "reminder", subject: "כולם {{org}}", body: "גוף כולם" },
      { organizationId: "org1", key: "reminder", subject: null, body: "גוף שלנו {{name}}" },
    ];
    expect(effectiveTemplate("reminder", rows, "org1")).toEqual({ subject: DEFAULT_TEMPLATES.reminder!.subject, body: "גוף שלנו {{name}}", source: "org" });
    expect(effectiveTemplate("reminder", rows, "org2").source).toBe("all");
    expect(effectiveTemplate("reminder", [], "org2").source).toBe("default");
    expect(renderMessage({ subject: "{{org}}", body: "שלום {{name}} {{unknown}}" }, { org: "פנימה", name: "דנה" })).toEqual({ subject: "פנימה", body: "שלום דנה " });
  });

  it("adds people once per address and parses typed address lists", () => {
    expect(addPeople([{ name: "א", email: "a@x.co" }], [{ name: "A", email: "A@X.co" }, { email: "b@x.co" }, null, { name: "ריק", email: "" }])).toEqual([
      { name: "א", email: "a@x.co" },
      { name: "b@x.co", email: "b@x.co" },
    ]);
    expect(parseEmailList("Office@a.org.il, b@b.co;\nלא מייל\nb@b.co")).toEqual(["office@a.org.il", "b@b.co"]);
  });
});
