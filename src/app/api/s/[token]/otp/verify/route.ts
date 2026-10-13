import { NextResponse } from "next/server";
import { verifyOtp } from "@/server/signing";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  if (typeof body?.code !== "string") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const r = await verifyOtp(token, body.code);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === "wrong" || r.reason === "expired" || r.reason === "missing" ? 422 : r.reason === "locked" ? 429 : 410 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(r.cookie.name, r.cookie.value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: r.cookie.maxAgeSeconds });
  return res;
}
