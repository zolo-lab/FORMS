"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authDisabled } from "@/lib/auth/open-mode";
import { devLoginAllows, devLoginEnabled } from "@/lib/auth/dev-login";
import { RETURN_COOKIE, SESSION_COOKIE, SESSION_TTL_MS, createUserSessionToken } from "@/lib/auth/session";

const UUID = /^[0-9a-f-]{36}$/i;
const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL_MS / 1000 };

/** One click on the test login screen: act as this user. The "חזרה למנהל" bar in the admin area leads back. */
export async function devLoginAction(fd: FormData) {
  if (!devLoginEnabled()) redirect("/login");
  const id = String(fd.get("id") ?? "");
  const [u] = UUID.test(id) ? await db.select().from(schema.users).where(eq(schema.users.id, id)) : [];
  const secret = process.env.SESSION_SECRET;
  if (!u || !secret || !devLoginAllows(u)) redirect("/dev-login?error=user");
  const jar = await cookies();
  if (!jar.get(RETURN_COOKIE)) jar.set(RETURN_COOKIE, authDisabled() ? "open" : (jar.get(SESSION_COOKIE)?.value ?? "open"), cookieOpts);
  jar.set(SESSION_COOKIE, await createUserSessionToken(secret, u.email), cookieOpts);
  redirect(u.role !== "admin" && u.grants?.trackOnly ? "/admin/track" : "/admin/inbox");
}

/** Open mode only: back to the system manager without any user (as before choosing one). */
export async function devLoginAsManagerAction() {
  if (!authDisabled()) redirect("/login");
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(RETURN_COOKIE);
  redirect("/admin/requests");
}
