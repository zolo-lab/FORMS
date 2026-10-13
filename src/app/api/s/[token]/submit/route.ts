import { NextResponse } from "next/server";
import { submit } from "@/server/signing";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => null)) as { answers?: Record<string, unknown> } | null;
  if (!body?.answers || typeof body.answers !== "object") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const r = await submit(token, body.answers, req.headers.get("cookie"));
  if (r.ok) return NextResponse.json({ ok: true, message: r.message, waitingFor: r.waitingFor, completed: r.completed });
  if ("errors" in r) return NextResponse.json({ errors: r.errors }, { status: 422 });
  return NextResponse.json({ error: r.state }, { status: r.state === "otp_required" ? 401 : 410 });
}
