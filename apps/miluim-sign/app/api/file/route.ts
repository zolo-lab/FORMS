import { NextResponse } from "next/server";
import { isBlobUrl, readBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!isBlobUrl(url)) return NextResponse.json({ error: "קובץ לא נמצא" }, { status: 404 });
  const file = await readBytes(url);
  if (!file) return NextResponse.json({ error: "קובץ לא נמצא" }, { status: 404 });
  const type = file.type === "application/pdf" || file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp" ? file.type : "";
  if (!type) return NextResponse.json({ error: "סוג הקובץ אינו נתמך" }, { status: 415 });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "content-type": type,
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
