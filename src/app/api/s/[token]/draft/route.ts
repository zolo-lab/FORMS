import { NextResponse } from "next/server";
import { saveDraft } from "@/server/signing";

export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => null)) as { answers?: Record<string, unknown> } | null;
  if (!body?.answers || typeof body.answers !== "object") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const r = await saveDraft(token, body.answers, req.headers.get("cookie"));
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.state }, { status: r.state === "otp_required" ? 401 : 410 });
}
