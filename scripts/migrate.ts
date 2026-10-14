/**
 * Applies pending SQL migrations from drizzle/*.sql, tracked in the `schema_migrations` table
 * (the same table the manual Neon-console process writes to, so already-applied migrations are skipped).
 * Runs from `vercel-build` before `next build`. Opt-in: only when AUTO_MIGRATE=1.
 * Neon HTTP has no transactions: a failing migration stops the build, fix it and re-deploy.
 */
import { neon } from "@neondatabase/serverless";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  if (process.env.AUTO_MIGRATE !== "1") {
    console.log("migrate: AUTO_MIGRATE is not 1, skipping");
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("migrate: DATABASE_URL is not set");
  const sql = neon(url);
  await sql.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())");
  const done = new Set((await sql.query("select name from schema_migrations")).map((r) => r.name as string));
  const files = readdirSync("drizzle").filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const file of files) {
    const name = file.replace(/\.sql$/, "");
    if (done.has(name)) continue;
    console.log(`migrate: applying ${name}`);
    for (const stmt of readFileSync(join("drizzle", file), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await sql.query(stmt);
    }
    await sql.query("insert into schema_migrations (name) values ($1)", [name]);
  }
  console.log("migrate: up to date");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
