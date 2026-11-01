import { describe, expect, it } from "vitest";
import { allowedOrgs, linkOrg, publicFillPath, publicRole, publicStart, subjectFromAnswers } from "@/lib/forms/public-link";
import { lockOrgFields, withOrgFields, withPrefill } from "@/lib/forms/prefill";
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

  it("skips a sender with nothing to fill and opens on the employee who comes next", () => {
    const steps = [{ role: "requester" as const }, { role: "employee" as const }];
    expect(publicRole(steps, () => true)).toBe("requester");
    expect(publicRole(steps, (r) => r === "employee")).toBe("employee");
    expect(publicRole(steps, () => false)).toBeNull();
    expect(publicRole([{ role: "requester" }, { role: "approver" }], (r) => r === "employee")).toBeNull();
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

describe("a form's link per organization", () => {
  const org = (id: string, slug: string | null, active = true) => ({ id, name: `ארגון ${id}`, slug, active });
  const orgs = [org("a", "pnima"), org("b", "el-ami"), org("c", "old", false)];

  it("is /f/<form>/<organization>", () => {
    expect(publicFillPath("abc", "pnima")).toBe("/f/abc/pnima");
    expect(publicFillPath("abc", null)).toBe("/f/abc");
  });

  it("is open to the ticked organizations, else the form's one, else all active ones", () => {
    expect(allowedOrgs({ organizationId: null, organizationIds: ["b", "c"] }, orgs).map((o) => o.id)).toEqual(["b"]);
    expect(allowedOrgs({ organizationId: "a", organizationIds: [] }, orgs).map((o) => o.id)).toEqual(["a"]);
    expect(allowedOrgs({ organizationId: null }, orgs).map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("the organization comes from the link; without one only a single-organization form opens", () => {
    const allowed = allowedOrgs({ organizationId: null }, orgs);
    expect(linkOrg(allowed, "PNIMA")).toMatchObject({ ok: true, org: { id: "a" } });
    expect(linkOrg(allowed, "old")).toEqual({ ok: false, reason: "org_not_allowed" });
    expect(linkOrg(allowed, null)).toEqual({ ok: false, reason: "choose_org" });
    expect(linkOrg([orgs[0]!], undefined)).toMatchObject({ ok: true, org: { id: "a" } });
    expect(linkOrg([], undefined)).toEqual({ ok: false, reason: "no_organization" });
  });
});

describe("the organization's fields", () => {
  const d = def([
    { id: "org_name", type: "short_text", label: "שם העמותה" },
    { id: "org_number", type: "short_text", label: 'ח"פ' },
    { id: "other", type: "short_text", label: "שם" },
  ]);
  const org = { name: "פנימה", registrationNumber: "580000000" };

  it("fill themselves from the organization and override whatever was sent", () => {
    expect(withOrgFields(d, org, { org_name: "אחר", other: "x" })).toEqual({ org_name: "פנימה", org_number: "580000000", other: "x" });
    expect(withPrefill(d, { name: "דנה", org }, {})).toEqual({ org_name: "פנימה", org_number: "580000000" });
    expect(withOrgFields(d, null, { org_name: "x" })).toEqual({ org_name: "x" });
  });

  it("are read-only for whoever fills the form; a prefill set by hand counts too", () => {
    const locked = lockOrgFields(def([{ id: "org_name", type: "short_text", label: "שם העמותה" }, { id: "x", type: "short_text", label: "x", prefill: "org.name" } as never, { id: "y", type: "short_text", label: "y" }]));
    expect(locked.pages[0]!.fields.map((f) => !!f.readOnly)).toEqual([true, true, false]);
  });
});

describe("fixed ids of the organization's fields", () => {
  it("names the organization's name and number org_name / org_number, nothing else", async () => {
    const { orgFieldKey, fieldKey } = await import("@/lib/forms/field-keys");
    expect(["שם העמותה", "העמותה", "שם הארגון", "שם המעסיק"].map(orgFieldKey)).toEqual(["org_name", "org_name", "org_name", "org_name"]);
    expect(['ח"פ', "מספר עמותה", "מספר העמותה"].map(orgFieldKey)).toEqual(["org_number", "org_number", "org_number"]);
    expect(["כתובת העמותה", "טלפון העמותה", "שם העובד", "שם פרטי"].map(orgFieldKey)).toEqual([null, null, null, null]);
    expect(fieldKey("שם העמותה", "ב. פרטי העובד")).toBe("org_name");
  });
});

describe("a project's link", () => {
  it("is /f/<form>/<organization>/<project>, and names an active project of that organization", async () => {
    const { linkProject, projectSlug } = await import("@/lib/forms/public-link");
    const { labelKey } = await import("@/lib/forms/field-keys");
    expect(publicFillPath("abc", "shivat-zion", "artznv")).toBe("/f/abc/shivat-zion/artznv");
    const ps = [{ id: "1", slug: "artznv", active: true }, { id: "2", slug: "tt", active: false }];
    expect(linkProject(ps, "ARTZNV")).toEqual({ ok: true, project: ps[0] });
    expect(linkProject(ps, null)).toEqual({ ok: true, project: null });
    expect(linkProject(ps, "tt")).toEqual({ ok: false, reason: "org_not_allowed" });
    expect(projectSlug("ארצנו", [], labelKey)).toBe("artznv");
    expect(projectSlug("ארצנו", ["artznv"], labelKey)).toBe("artznv-2");
    expect(projectSlug("!!!", [], () => "")).toBe("project");
  });
});
