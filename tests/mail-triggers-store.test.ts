/** Runs against the dev database; skipped when DATABASE_URL is not set. Uses its own organization, removed at the end. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("mail triggers (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("the sender hears what went out; the trigger's switch and text are respected", async () => {
    const { db, schema } = await import("@/db");
    const { and, eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const triggers = await import("@/server/mail-triggers");
    const stamp = Date.now();

    const [org] = await db.insert(schema.organizations).values({ name: `ארגון טריגרים ${stamp}`, registrationNumber: `T${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, org!.id)));
    cleanup.push(() => db.delete(schema.mailTriggers).where(eq(schema.mailTriggers.organizationId, org!.id)));
    cleanup.push(() => db.delete(schema.messageTemplates).where(eq(schema.messageTemplates.organizationId, org!.id)));
    const [user] = await db.insert(schema.users).values({ email: `sender-${stamp}@example.test`, name: "רות שולחת", role: "admin" }).returning();
    cleanup.push(() => db.delete(schema.users).where(eq(schema.users.id, user!.id)));
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({ name: `קליטה ${stamp}`, organizationId: org!.id, mailNote: "לא ניתן להתחיל ללא חתימה", workflow: { steps: [{ order: 1, role: "employee", action: "fill_and_sign" }] } })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const open = async (name: string) => {
      const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name, email: `e-${stamp}@example.test` }, createdBy: user!.id });
      cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
      cleanup.push(() => db.delete(schema.notifications).where(eq(schema.notifications.requestId, id)));
      await store.sendRequest(id, { type: "user", id: user!.id });
      return db.select().from(schema.notifications).where(eq(schema.notifications.requestId, id));
    };

    // Defaults: the employee gets the invitation, the sender gets "נשלח טופס".
    let mails = await open("דנה");
    expect(mails.map((m) => m.templateKey).sort()).toEqual(["sent_to_creator", "step_invite"]);
    const sent = mails.find((m) => m.templateKey === "sent_to_creator")!;
    expect(sent.to).toBe(user!.email);
    expect(sent.subject).toBe(`נשלח טופס קליטה ${stamp} לדנה`);
    expect(sent.body).toMatch(/ממתין עכשיו ל: .+ \(דנה\)/);

    // This organization's own text for the invitation, with the form's note.
    await triggers.saveTemplate(org!.id, "step_invite", { subject: "מסמכים מ{{org}}", body: "שלום {{name}}\n{{note}}\nלשאלות: {{creatorName}} {{creatorEmail}}\n{{link}}" });
    // …and the sender notice switched off.
    await triggers.saveTriggerSetting(org!.id, "sent_to_creator", { enabled: false, recipients: ["creator"], fixedRecipients: [] });
    mails = await open("יוסי");
    expect(mails.map((m) => m.templateKey)).toEqual(["step_invite"]);
    expect(mails[0]!.subject).toBe(`מסמכים מארגון טריגרים ${stamp}`);
    expect(mails[0]!.body).toContain("לא ניתן להתחיל ללא חתימה");
    expect(mails[0]!.body).toContain(`לשאלות: רות שולחת ${user!.email}`);

    // Switching the invitation off stops it; the link is still made (it can be copied from the request page).
    await triggers.saveTriggerSetting(org!.id, "step_invite", { enabled: false, recipients: ["signer"], fixedRecipients: [] });
    mails = await open("מיכל");
    expect(mails).toEqual([]);
    const settings = await db.select().from(schema.mailTriggers).where(and(eq(schema.mailTriggers.organizationId, org!.id), eq(schema.mailTriggers.key, "step_invite")));
    expect(settings).toHaveLength(1);

    // The open-requests summary goes to the secretariat with every request still open.
    const summary = await import("@/server/open-summary");
    cleanup.push(() => db.delete(schema.notifications).where(eq(schema.notifications.organizationId, org!.id)));
    expect(await summary.runOpenSummary(new Date(), { force: true, organizationId: org!.id })).toBe(0); // no secretariat yet
    await triggers.saveOrgAddresses(org!.id, [`office-${stamp}@example.test`], []);
    expect(await summary.runOpenSummary(new Date(), { force: true, organizationId: org!.id })).toBe(1);
    const [sum] = await db.select().from(schema.notifications).where(and(eq(schema.notifications.organizationId, org!.id), eq(schema.notifications.templateKey, "open_summary")));
    expect(sum!.to).toBe(`office-${stamp}@example.test`);
    expect(sum!.subject).toBe(`3 בקשות פתוחות – ארגון טריגרים ${stamp}`);
    for (const name of ["דנה", "יוסי", "מיכל"]) expect(sum!.body).toContain(name);
  });
});
