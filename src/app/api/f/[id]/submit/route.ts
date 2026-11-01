import { NextResponse } from "next/server";
import { publicSubmit } from "@/server/public-fill";

/** Sending the form from its link: creates the request and submits its first step (see `publicSubmit`). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { answers?: Record<string, unknown>; website?: string; org?: string } | null;
  if (!body?.answers || typeof body.answers !== "object") return NextResponse.json({ error: "bad request" }, { status: 400 });
  // A field people never see: bots fill it, people do not.
  if (body.website) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const org = typeof body.org === "string" && /^[a-z0-9-]{1,60}$/.test(body.org) ? body.org : null;
  const r = await publicSubmit(id, body.answers, org);
  if (r.ok) return NextResponse.json(r);
  if ("errors" in r) return NextResponse.json({ errors: r.errors }, { status: 422 });
  return NextResponse.json({ error: r.error }, { status: r.error === "not_found" ? 404 : 410 });
}
