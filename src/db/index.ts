import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;
let instance: Db | undefined;

/** Created on first use, so `next build` and tests that never touch the DB work without DATABASE_URL. */
function connect(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return (instance ??= drizzle(neon(url), { schema }));
}

export const db: Db = new Proxy({} as Db, {
  get: (_t, prop) => Reflect.get(connect(), prop),
});
export { schema };
