import { describe, expect, it } from "vitest";
import { addPeople, effectiveTemplate, effectiveTrigger, parseEmailList, parseTriggerForm, renderMessage, TRIGGERS, type TriggerSetting } from "@/lib/notifications/triggers";
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

describe("trigger form", () => {
  const form = (o: Record<string, string | string[]>) => ({
    get: (n: string) => (typeof o[n] === "string" ? (o[n] as string) : null),
    getAll: (n: string) => (Array.isArray(o[n]) ? (o[n] as string[]) : typeof o[n] === "string" ? [o[n] as string] : []),
  });
  const parse = (key: string, o: Record<string, string | string[]>) => {
    const f = form(o);
    return parseTriggerForm(key, f.get, f.getAll);
  };
  it("keeps allowed recipients and the typed fixed addresses", () => {
    expect(parse("completed", { enabled: "on", recipients: ["creator", "signer", "fixed"], fixed: "a@x.co, b@x.co" })).toEqual({
      ok: true,
      value: { enabled: true, recipients: ["creator", "fixed"], fixedRecipients: [{ name: "a@x.co", email: "a@x.co" }, { name: "b@x.co", email: "b@x.co" }] },
    });
  });
  it("switched off may have no recipients; switched on must have one", () => {
    expect(parse("completed", {})).toMatchObject({ ok: true, value: { enabled: false, recipients: [] } });
    expect(parse("completed", { enabled: "on" })).toEqual({ ok: false, error: "no_recipients" });
  });
  it("fixed addresses chosen but none typed, locked and unknown triggers", () => {
    expect(parse("completed", { enabled: "on", recipients: ["fixed"], fixed: "לא מייל" })).toEqual({ ok: false, error: "no_fixed" });
    expect(parse("otp", { enabled: "on" })).toEqual({ ok: false, error: "locked" });
    expect(parse("nope", {})).toEqual({ ok: false, error: "unknown" });
  });
});
