import { NextResponse } from "next/server";
import { getDocument } from "@/lib/db";
import { readBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const document = await getDocument(id);
  if (!document) return NextResponse.json({ error: "הטופס לא נמצא" }, { status: 404 });
  const kind = new URL(req.url).searchParams.get("kind");
  const url = kind === "pdf" ? document.signedPdfPath : document.signedImagePath ?? document.pages[0]?.path;
  if (!url) return NextResponse.json({ error: "אין קובץ" }, { status: 404 });
  const file = await readBytes(url);
  if (!file) return NextResponse.json({ error: "הקובץ לא נמצא" }, { status: 404 });
  const filename = kind === "pdf" ? "signed.pdf" : "signed.jpg";
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "content-type": file.type,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
