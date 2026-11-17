import { NextResponse } from "next/server";
import { SESSION_COOKIE, checkPasscode, createSessionToken } from "@/lib/auth";
import { clearLoginFailures, loginLocked, recordLoginFailure } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { passcode?: unknown } | null;
  const passcode = typeof body?.passcode === "string" ? body.passcode : "";
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim().slice(0, 64) || "unknown";
  if (!process.env.OFFICER_PASSCODE || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: "המערכת עדיין לא הוגדרה" }, { status: 500 });
  }
  if (await loginLocked(ip)) return NextResponse.json({ error: "יותר מדי ניסיונות. נסו שוב בעוד רבע שעה." }, { status: 429 });
  if (!checkPasscode(passcode, process.env.OFFICER_PASSCODE)) {
    await recordLoginFailure(ip);
    return NextResponse.json({ error: "קוד הכניסה שגוי" }, { status: 401 });
  }
  await clearLoginFailures(ip);
  const token = await createSessionToken(process.env.SESSION_SECRET);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
