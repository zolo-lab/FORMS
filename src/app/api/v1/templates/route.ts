import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api/respond";
import { authenticate, listApiTemplates } from "@/server/api-v1";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticate(req.headers.get("authorization"));
  if (!auth) return unauthorized();
  return NextResponse.json({ templates: await listApiTemplates(auth.organizationId) });
}
