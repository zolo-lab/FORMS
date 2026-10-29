/** After every e2e run: remove what the tests created in the dev database (see clean-test-data.ts). */
import { neon } from "@neondatabase/serverless";
import { cleanTestData } from "./clean-test-data";

export default async function globalTeardown() {
  const url = process.env.DATABASE_URL;
  if (!url || !process.env.CI) return; // only in CI, where DATABASE_URL is the dev database
  const { forms, orgs } = await cleanTestData(neon(url));
  console.log(`e2e teardown: removed ${forms} test forms and ${orgs} test organizations`);
}
