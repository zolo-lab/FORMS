"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authDisabled } from "@/lib/auth/open-mode";
import { devLoginAllows, devLoginEnabled, devSignAllows } from "@/lib/auth/dev-login";
import { createToken } from "@/lib/auth/tokens";
import { OTP_COOKIE_TTL_MS, otpCookieName, otpCookieValue } from "@/lib/auth/otp";
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

/**
 * "כניסה וחתימה" for someone who is not a user (the employee, an approver by e-mail): opens their waiting step with a
 * fresh link of its own, like a reminder does, so the link already sent by mail keeps working. The one-time code is
 * skipped: on the test screen there is no mailbox to read it from.
 */
export async function devSignAsAction(fd: FormData) {
  if (!devLoginEnabled()) redirect("/login");
  const stepId = String(fd.get("stepId") ?? "");
  const [row] = UUID.test(stepId)
    ? await db
        .select({ step: schema.signingSteps, request: schema.requests })
        .from(schema.signingSteps)
        .innerJoin(schema.requests, eq(schema.requests.id, schema.signingSteps.requestId))
        .where(eq(schema.signingSteps.id, stepId))
    : [];
  const secret = process.env.SESSION_SECRET;
  const waiting = row && ["active", "in_progress"].includes(row.step.status) && ["in_progress", "returned"].includes(row.request.status);
  if (!row || !waiting || !secret || !devSignAllows(row.step.assigneeEmail)) redirect("/dev-login?error=step");
  const { token, hash } = createToken();
  await db.insert(schema.stepTokens).values({ stepId: row.step.id, tokenHash: hash, expiresAt: row.request.expiresAt });
  if (row.step.otpRequired) {
    (await cookies()).set(otpCookieName(row.step.id), otpCookieValue(secret, row.step.id, Date.now() + OTP_COOKIE_TTL_MS), { ...cookieOpts, maxAge: OTP_COOKIE_TTL_MS / 1000 });
  }
  redirect(`/s/${token}`);
}
