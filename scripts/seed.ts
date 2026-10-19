/**
 * Idempotent seed: organizations + the default onboarding package.
 * Run: DATABASE_URL=... pnpm seed   (dev branch only unless approved)
 * Source of the registration numbers: claude.ai project doc "מיפוי-מערכת-קליטה-קיימת" §2.
 * Note: ארצנו shares the legal entity (and number) of שיבת ציון, so it is not a separate row.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import type { Workflow } from "../src/lib/workflow/types";
import { termsChangeRequest, termsChangeWorkflow } from "../tests/fixtures/package-terms-change";

const ORGS = [
  { name: "שיבת ציון לרגבי אדמתה", registrationNumber: "580556306", slug: "shivat-zion" },
  { name: "גרעין יחד בית שאן והעמק", registrationNumber: "580479996", slug: "garin-yachad" },
  { name: "פנימה", registrationNumber: "580078277", slug: "pnima" },
  { name: "אל עמי נחלת יהושע", registrationNumber: "580056307", slug: "el-ami" },
];

const ONBOARDING_WORKFLOW: Workflow = {
  steps: [
    { order: 1, role: "requester", action: "fill" },
    { order: 2, role: "employee", action: "fill_and_sign", otpRequired: false },
    { order: 3, role: "payroll", action: "approve", assignee: { name: "חשבות שכר" } },
  ],
};

const TERMINATION_WORKFLOW: Workflow = {
  steps: [
    { order: 1, role: "requester", action: "fill" },
    { order: 2, role: "employee", action: "fill_and_sign", otpRequired: false },
    { order: 3, role: "payroll", action: "approve", assignee: { name: "חשבות שכר" } },
  ],
};

/** Idempotent: creates the package if missing; an existing one is left alone (the admin may have edited it in the UI). */
async function ensurePackage(name: string, description: string, workflow: Workflow) {
  const existing = await db.select().from(schema.packageTemplates).where(eq(schema.packageTemplates.name, name));
  if (existing.length === 0) await db.insert(schema.packageTemplates).values({ name, description, workflow });
}

async function main() {
  for (const o of ORGS) {
    await db
      .insert(schema.organizations)
      .values(o)
      .onConflictDoUpdate({ target: schema.organizations.registrationNumber, set: { name: o.name, slug: o.slug } });
  }

  const name = "קליטת עובד רגיל";
  const existing = await db.select().from(schema.packageTemplates).where(eq(schema.packageTemplates.name, name));
  if (existing.length === 0) {
    await db.insert(schema.packageTemplates).values({
      name,
      description: "מבקש ממלא פרטי העסקה → העובד ממלא וחותם → חשבות שכר מאשרת",
      workflow: ONBOARDING_WORKFLOW,
    });
  } else {
    await db
      .update(schema.packageTemplates)
      .set({ workflow: ONBOARDING_WORKFLOW })
      .where(eq(schema.packageTemplates.id, existing[0]!.id));
  }

  // Same engine, different documents: attach the termination forms to this package under /admin/packages.
  await ensurePackage("סיום העסקה", "מבקש ממלא פרטי סיום → העובד חותם → חשבות שכר מאשרת", TERMINATION_WORKFLOW);

  // v4 test package "שינוי תנאים (בדיקה)": the request form with two internal fields, employee → approver from the
  // "manager" field → payroll, expiry on the 4th of the month after the start date. Left alone once it exists.
  const testName = "שינוי תנאים (בדיקה)";
  if ((await db.select().from(schema.packageTemplates).where(eq(schema.packageTemplates.name, testName))).length === 0) {
    const slug = "terms-change-test";
    let [tpl] = await db.select().from(schema.formTemplates).where(eq(schema.formTemplates.slug, slug));
    if (!tpl) {
      [tpl] = await db.insert(schema.formTemplates).values({ slug, title: "שינוי תנאים – בקשה (בדיקה)", status: "active", publishedVersion: 1 }).returning();
      await db.insert(schema.formTemplateVersions).values({ templateId: tpl!.id, version: 1, definition: termsChangeRequest, publishedAt: new Date() });
    }
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({
        name: testName,
        description: "ערכת בדיקה של v4: שדות פנימיים, תוקף מחושב, מאשר משדה, טיפול אחרי חתימה",
        workflow: termsChangeWorkflow,
        expiryRule: { kind: "dayOfNextMonth", day: 4, dateFieldId: "start_work_date" },
        followUpStatuses: [{ key: "payroll", label: "עודכן בשכר" }],
      })
      .returning();
    await db.insert(schema.packageTemplateItems).values({ packageTemplateId: pkg!.id, templateId: tpl!.id, order: 1 });
  }

  const orgs = await db.select().from(schema.organizations);
  const pkgs = await db.select().from(schema.packageTemplates);
  console.log(`seed ok: ${orgs.length} organizations, ${pkgs.length} package templates`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
