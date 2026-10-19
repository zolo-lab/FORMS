"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeNext } from "@/lib/auth/google";
import { isDemoAddress, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, SESSION_TTL_MS, checkAdminPassword, createSessionToken, createUserSessionToken } from "@/lib/auth/session";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const secret = process.env.SESSION_SECRET;
  const ident = String(formData.get("email") ?? "").trim().toLowerCase();
  // A user with their own password: e-mail or user name (users created without e-mail sign in with the user name).
  if (ident) {
    if (!secret) return { error: "ההתחברות לא הוגדרה בשרת (SESSION_SECRET)" };
    const [u] = await db.select().from(schema.users).where(ident.includes("@") ? eq(schema.users.email, ident) : eq(schema.users.login, ident));
    const email = u?.email ?? ident;
    // Demo sign-in without a password: only for invented addresses (@demo.test…) and only while DEMO_LOGIN=1 is set.
    const demoOpen = process.env.DEMO_LOGIN === "1" && isDemoAddress(email) && !password;
    if (demoOpen && !u) return { error: "אין משתמש הדגמה כזה. מנהל/ת המערכת יוצר/ת אותו במסך המשתמשים." };
    if (!u || !u.active || !(demoOpen || verifyPassword(password, u.passwordHash))) return { error: "שם משתמש / מייל או סיסמה שגויים" };
    (await cookies()).set(SESSION_COOKIE, await createUserSessionToken(secret, email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    redirect(safeNext(String(formData.get("next") ?? "")));
  }
  if (!process.env.ADMIN_PASSWORD || !secret) return { error: "ההתחברות לא הוגדרה בשרת (ADMIN_PASSWORD / SESSION_SECRET)" };
  if (!(await checkAdminPassword(password, process.env.ADMIN_PASSWORD))) return { error: "סיסמה שגויה" };
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/admin/forms");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
