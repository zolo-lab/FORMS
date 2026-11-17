import { NextResponse } from "next/server";
import { deleteDocument, getDocument, markSeen } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const document = await getDocument(id);
  if (!document) return NextResponse.json({ error: "הטופס לא נמצא" }, { status: 404 });
  if (!document.seen && document.status === "signed") await markSeen(id);
  return NextResponse.json({ document: { ...document, seen: document.status === "signed" ? true : document.seen } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteDocument(id);
  return NextResponse.json({ ok: true });
}
