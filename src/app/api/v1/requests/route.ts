import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api/respond";
import { authenticate, createApiRequest, listApiRequests } from "@/server/api-v1";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = await authenticate(req.headers.get("authorization"));
  if (!auth) return unauthorized();
  const q = new URL(req.url).searchParams;
  const limit = q.get("limit") ? Number(q.get("limit")) : undefined;
  return NextResponse.json(
    await listApiRequests(auth.organizationId, {
      from: q.get("from") ?? undefined,
      to: q.get("to") ?? undefined,
      status: q.get("status") ?? undefined,
      before: q.get("before") ?? undefined,
      limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
    }),
  );
}

export async function POST(req: Request) {
  const auth = await authenticate(req.headers.get("authorization"));
  if (!auth) return unauthorized();
  const body = await req.json().catch(() => null);
  const r = await createApiRequest(auth.organizationId, body);
  if (!r.ok) return NextResponse.json({ error: "validation_failed", errors: r.errors }, { status: r.status });
  return NextResponse.json(r.body, { status: r.status });
}
