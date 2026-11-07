"use server";
import { linkExpiryOf } from "@/lib/requests/expiry";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createToken } from "@/lib/auth/tokens";
import { OTP_COOKIE_TTL_MS, otpCookieName, otpCookieValue } from "@/lib/auth/otp";
import { currentUser } from "@/server/users-store";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * "פתיחה וחתימה" on a card in "ממתינים לי": opens the signed-in user's own waiting step of that request on the usual
 * signing page, with a link of its own (the one sent by mail keeps working). The user is already signed in as the
 * person the step goes to, so the one-time code is not asked again.
 */
export async function openMyStepAction(fd: FormData) {
  const me = await currentUser();
  const requestId = String(fd.get("requestId") ?? "");
  if (!me || !UUID.test(requestId)) redirect("/admin/inbox");
  const [row] = await db
    .select({ step: schema.signingSteps, expiresAt: schema.requests.expiresAt })
    .from(schema.signingSteps)
    .innerJoin(schema.requests, eq(schema.requests.id, schema.signingSteps.requestId))
    .where(and(
      eq(schema.signingSteps.requestId, requestId),
      sql`lower(${schema.signingSteps.assigneeEmail}) = ${me!.email.toLowerCase()}`,
      inArray(schema.signingSteps.status, ["active", "in_progress"]),
      inArray(schema.requests.status, ["in_progress", "returned"]),
    ))
    .limit(1);
  if (!row) redirect("/admin/inbox?gone=1");
  const { token, hash } = createToken();
  await db.insert(schema.stepTokens).values({ stepId: row!.step.id, tokenHash: hash, expiresAt: linkExpiryOf(row!.step, row!) });
  const secret = process.env.SESSION_SECRET;
  if (row!.step.otpRequired && secret) {
    (await cookies()).set(otpCookieName(row!.step.id), otpCookieValue(secret, row!.step.id, Date.now() + OTP_COOKIE_TTL_MS), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: OTP_COOKIE_TTL_MS / 1000,
    });
  }
  redirect(`/s/${token}`);
}
