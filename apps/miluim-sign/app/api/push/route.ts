import { NextResponse } from "next/server";
import { deletePush, savePush } from "@/lib/db";

const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "notify.windows.com"];

function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const hostAllowed = PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return url.protocol === "https:" && url.port === "" && hostAllowed;
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!isAllowedPushEndpoint(endpoint) || !p256dh || !auth) return NextResponse.json({ error: "מנוי לא תקין" }, { status: 400 });
  await savePush({ id: crypto.randomUUID(), endpoint, p256dh, auth });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint === "string" && isAllowedPushEndpoint(body.endpoint)) await deletePush(body.endpoint);
  return NextResponse.json({ ok: true });
}
