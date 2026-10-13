import { NextResponse } from "next/server";
import { notFound, unauthorized } from "@/lib/api/respond";
import { authenticate, cancelApiRequest, getApiRequest } from "@/server/api-v1";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req.headers.get("authorization"));
  if (!auth) return unauthorized();
  const { id } = await params;
  const r = UUID.test(id) ? await getApiRequest(auth.organizationId, id) : null;
  return r ? NextResponse.json(r) : notFound();
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req.headers.get("authorization"));
  if (!auth) return unauthorized();
  const { id } = await params;
  if (!UUID.test(id)) return notFound();
  const r = await cancelApiRequest(auth.organizationId, id);
  if (r === "not_found") return notFound();
  if (r === "conflict") return NextResponse.json({ error: "conflict", message: "The request is already finished or cancelled." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
