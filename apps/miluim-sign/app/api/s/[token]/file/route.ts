import { NextResponse } from "next/server";
import { getByToken } from "@/lib/db";
import { readBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const doc = await getByToken(token);
  if (!doc) return NextResponse.json({ error: "הקישור אינו תקף" }, { status: 404 });
  const signed = new URL(req.url).searchParams.get("signed");
  const page = Number(new URL(req.url).searchParams.get("page") ?? "0");
  const url = signed ? doc.signedImagePath : doc.pages[page]?.path;
  if (!url) return NextResponse.json({ error: "אין קובץ" }, { status: 404 });
  const file = await readBytes(url);
  if (!file) return NextResponse.json({ error: "הקובץ לא נמצא" }, { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: { "content-type": file.type, "cache-control": "private, no-store" },
  });
}
