import { NextResponse } from "next/server";
import { sendOtp } from "@/server/signing";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await sendOtp(token);
  if (r.ok) return NextResponse.json({ ok: true, sentTo: r.sentTo });
  return NextResponse.json({ error: r.reason }, { status: r.reason === "too_soon" || r.reason === "daily_limit" ? 429 : r.reason === "no_email" ? 422 : 410 });
}
