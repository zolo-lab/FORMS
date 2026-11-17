import { NextResponse } from "next/server";
import { putBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "קובץ חסר" }, { status: 400 });
  if (file.size > 8_000_000) return NextResponse.json({ error: "הקובץ גדול מדי" }, { status: 413 });
  const type = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
  if (file.type && !file.type.startsWith("image/")) return NextResponse.json({ error: "אפשר להעלות תמונה בלבד" }, { status: 415 });
  const url = await putBytes(new Uint8Array(await file.arrayBuffer()), type);
  return NextResponse.json({ url });
}
