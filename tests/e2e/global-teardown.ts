/**
 * Deletes the forms this e2e run created in the dev database (titles end with a run number, e.g. "PDF e2e 1793…"),
 * with their own signing routes and the requests sent from them, so the preview site does not fill up with test forms.
 * Seeded forms ("קליטת עובד רגיל") and forms made by people are left alone.
 */
import { neon } from "@neondatabase/serverless";

export default async function globalTeardown() {
  const url = process.env.DATABASE_URL;
  const since = process.env.E2E_STARTED_AT;
  if (!url || !since) return;
  const sql = neon(url);
  const results = await sql.transaction([
    sql`create temp table del_t on commit drop as
          select id from form_templates
          where created_at >= ${since}::timestamptz and title ~ '[0-9]{6,}' and slug not in ('onboarding-basic', 'terms-change-test')`,
    sql`create temp table del_p on commit drop as
          select distinct i.package_template_id as id from package_template_items i
          where i.template_id in (select id from del_t)
            and not exists (select 1 from package_template_items j where j.package_template_id = i.package_template_id and j.template_id not in (select id from del_t))`,
    sql`delete from requests where package_template_id in (select id from del_p)`,
    sql`delete from package_documents where template_version_id in (select v.id from form_template_versions v where v.template_id in (select id from del_t))`,
    sql`delete from bulk_jobs where package_template_id in (select id from del_p)`,
    sql`delete from package_template_items where template_id in (select id from del_t)`,
    sql`delete from package_templates where id in (select id from del_p)`,
    sql`delete from webhooks where template_id in (select id from del_t)`,
    sql`delete from form_templates where id in (select id from del_t) returning id`,
    // Users, their contacts and groups made by tests/e2e/users.spec.ts.
    sql`delete from groups where name like 'קבוצת e2e %' and created_at >= ${since}::timestamptz`,
    sql`delete from contacts where email like 'e2e-%@example.test'`,
    sql`delete from users where email like 'e2e-%@example.test'`,
  ]);
  console.log(`e2e teardown: removed ${results[8]?.length ?? 0} test forms`);
}
