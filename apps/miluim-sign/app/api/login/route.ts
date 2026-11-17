import { NextResponse } from "next/server";
import { SESSION_COOKIE, checkPasscode, createSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { passcode?: unknown } | null;
  const passcode = typeof body?.passcode === "string" ? body.passcode : "";
  if (!process.env.OFFICER_PASSCODE || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: "המערכת עדיין לא הוגדרה" }, { status: 500 });
  }
  if (!checkPasscode(passcode, process.env.OFFICER_PASSCODE)) {
    return NextResponse.json({ error: "קוד הכניסה שגוי" }, { status: 401 });
  }
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
