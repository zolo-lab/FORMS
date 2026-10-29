/**
 * Removes everything the automated tests leave in the dev database (the one the preview site shows): test forms and
 * their routes and requests, organizations made by the API tests and what hangs on them, test webhooks and keys,
 * test users/contacts/groups, and what the detector learned from test forms. Test data is recognised by its name
 * (a run number in it: "PDF e2e 1793…", "ארגון API a 1791…", "Learn A 56600", "e2e-…@example.test").
 * Seeded forms and anything made by people are kept. Never run against production: callers only run it in CI.
 */
import type { NeonQueryFunction } from "@neondatabase/serverless";

const STAMP = "[0-9]{5,}";
const SEEDS = ["onboarding-basic", "terms-change-test"];

export async function cleanTestData(sql: NeonQueryFunction<false, false>): Promise<{ forms: number; orgs: number }> {
  const r = await sql.transaction([
    sql`create temp table del_o on commit drop as select id from organizations where name ~ ${"[0-9]{6,}"}`,
    sql`create temp table del_t on commit drop as
          select id from form_templates
          where (title ~ ${STAMP} or organization_id in (select id from del_o)) and slug <> all(${SEEDS})`,
    sql`create temp table del_p on commit drop as
          select p.id from package_templates p
          where p.name ~ ${STAMP}
             or p.organization_id in (select id from del_o)
             or not exists (select 1 from package_template_items i where i.package_template_id = p.id and i.template_id not in (select id from del_t))`,
    sql`delete from requests where package_template_id in (select id from del_p) or organization_id in (select id from del_o) or subject_name ~ ${STAMP}`,
    sql`delete from employees where name ~ ${STAMP}`,
    sql`delete from package_documents where template_version_id in (select v.id from form_template_versions v where v.template_id in (select id from del_t))`,
    sql`delete from bulk_jobs where package_template_id in (select id from del_p) or organization_id in (select id from del_o)`,
    sql`delete from package_template_items where template_id in (select id from del_t) or package_template_id in (select id from del_p)`,
    sql`delete from package_templates where id in (select id from del_p)`,
    sql`delete from webhooks where template_id in (select id from del_t) or organization_id in (select id from del_o) or url like '%.example.test%'`,
    sql`delete from detect_feedback where template_id in (select id from del_t)`,
    sql`delete from form_templates where id in (select id from del_t) returning id`,
    sql`delete from api_keys where organization_id in (select id from del_o)`,
    sql`delete from message_templates where organization_id in (select id from del_o)`,
    sql`delete from notifications where organization_id in (select id from del_o)`,
    sql`delete from groups where organization_id in (select id from del_o) or name like 'קבוצת e2e %'`,
    sql`delete from contacts where organization_id in (select id from del_o) or email like 'e2e-%@example.test'`,
    sql`update users set organization_id = null where organization_id in (select id from del_o)`,
    sql`delete from users where email like 'e2e-%@example.test'`,
    sql`delete from organizations where id in (select id from del_o) returning id`,
  ]);
  return { forms: (r[11] as unknown[]).length, orgs: (r[19] as unknown[]).length };
}
