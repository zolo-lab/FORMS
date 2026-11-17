import { NextResponse } from "next/server";
import { savePush } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return NextResponse.json({ error: "מנוי לא תקין" }, { status: 400 });
  await savePush({ id: crypto.randomUUID(), endpoint, p256dh, auth });
  return NextResponse.json({ ok: true });
}
