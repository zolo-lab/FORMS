import { NextResponse } from "next/server";
import { cleanFields, cleanPages } from "@/lib/clean";
import { insertTemplate, listTemplates } from "@/lib/db";
import { isBlobUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const templates = await listTemplates();
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { name?: unknown; pages?: unknown; fields?: unknown; thumbPath?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "תנו שם לתבנית" }, { status: 400 });
  const pages = cleanPages(body?.pages);
  const fields = cleanFields(body?.fields);
  if (!pages || !fields?.length) return NextResponse.json({ error: "התבנית חסרה דף או שדות" }, { status: 400 });
  const thumbPath = typeof body?.thumbPath === "string" && isBlobUrl(body.thumbPath) ? body.thumbPath : null;
  const id = crypto.randomUUID();
  await insertTemplate({ id, name, pages, fields, thumbPath });
  return NextResponse.json({ id });
}
