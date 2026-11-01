/** CI only: remove test data from the dev database (run after the unit tests and e2e, whatever their result). */
import { neon } from "@neondatabase/serverless";
import { cleanTestData } from "../tests/e2e/clean-test-data";

const url = process.env.DATABASE_URL;
if (!url || !process.env.CI) {
  console.log("skipped: needs CI and DATABASE_URL (the dev database)");
} else {
  cleanTestData(neon(url)).then((r) => console.log(`removed ${r.forms} test forms and ${r.orgs} test organizations`));
}
