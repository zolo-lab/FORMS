/**
 * Applies pending Drizzle migrations. Runs from `vercel-build` before `next build`.
 * Opt-in: set AUTO_MIGRATE=1 in the Vercel project (production) to enable; otherwise it does nothing.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

async function main() {
  if (process.env.AUTO_MIGRATE !== "1") {
    console.log("migrate: AUTO_MIGRATE is not 1, skipping");
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("migrate: DATABASE_URL is not set");
  await migrate(drizzle(neon(url)), { migrationsFolder: "drizzle" });
  console.log("migrate: done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
