import { NextResponse } from "next/server";
import { performAction, type SignerAction } from "@/server/signing";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => null)) as Partial<SignerAction> | null;
  let action: SignerAction | null = null;
  if (body?.type === "decline" && typeof body.reason === "string" && body.reason.trim()) action = { type: "decline", reason: body.reason };
  else if (body?.type === "return" && typeof body.toStepId === "string" && typeof body.reason === "string" && body.reason.trim()) action = { type: "return", toStepId: body.toStepId, reason: body.reason };
  else if (body?.type === "delegate" && body.assignee && typeof body.assignee.name === "string") action = { type: "delegate", assignee: { name: body.assignee.name, email: body.assignee.email || undefined, phone: body.assignee.phone || undefined } };
  if (!action) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const r = await performAction(token, req.headers.get("cookie"), action);
  if (r.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: r.reason }, { status: r.reason === "otp_required" ? 401 : 422 });
}
