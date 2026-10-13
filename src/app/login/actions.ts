"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_TTL_MS, checkAdminPassword, createSessionToken } from "@/lib/auth/session";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const secret = process.env.SESSION_SECRET;
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
