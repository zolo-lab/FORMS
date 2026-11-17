import { NextResponse } from "next/server";
import { cleanFields, cleanPages } from "@/lib/clean";
import { deleteTemplate, getTemplate, updateTemplate } from "@/lib/db";
import { isBlobUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const template = await getTemplate(id);
  if (!template) return NextResponse.json({ error: "התבנית לא נמצאה" }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const current = await getTemplate(id);
  if (!current) return NextResponse.json({ error: "התבנית לא נמצאה" }, { status: 404 });
  const body = await req.json().catch(() => null) as { name?: unknown; fields?: unknown; pages?: unknown; thumbPath?: unknown } | null;
  const patch: { name?: string; fields?: ReturnType<typeof cleanFields>; pages?: ReturnType<typeof cleanPages>; thumbPath?: string | null } = {};
  if (typeof body?.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "תנו שם לתבנית" }, { status: 400 });
    patch.name = name;
  }
  if (body && "fields" in body) {
    const fields = cleanFields(body.fields);
    if (!fields) return NextResponse.json({ error: "השדות אינם תקינים" }, { status: 400 });
    patch.fields = fields;
  }
  if (body && "pages" in body) {
    const pages = cleanPages(body.pages);
    if (!pages) return NextResponse.json({ error: "הדפים אינם תקינים" }, { status: 400 });
    patch.pages = pages;
  }
  if (typeof body?.thumbPath === "string") {
    if (!isBlobUrl(body.thumbPath)) return NextResponse.json({ error: "תמונה לא תקינה" }, { status: 400 });
    patch.thumbPath = body.thumbPath;
  }
  await updateTemplate(id, { name: patch.name, fields: patch.fields ?? undefined, pages: patch.pages ?? undefined, thumbPath: patch.thumbPath });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteTemplate(id);
  return NextResponse.json({ ok: true });
}
