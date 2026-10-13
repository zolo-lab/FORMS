import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db, schema } from "@/db";
import { putFile, sha256Hex } from "@/server/storage";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel function request bodies are limited to ~4.5MB

/** Upload a PDF template: validates it, records page sizes, stores the bytes. */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "לא נבחר קובץ" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "הקובץ גדול מדי (עד 4MB)" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return Response.json({ error: "הקובץ אינו PDF" }, { status: 400 });

  let pages: { width: number; height: number }[];
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    pages = doc.getPages().map((p) => ({ width: p.getWidth(), height: p.getHeight() }));
  } catch {
    return Response.json({ error: "לא ניתן לקרוא את ה-PDF (ייתכן שהוא מוגן בסיסמה)" }, { status: 400 });
  }

  const sha = sha256Hex(bytes);
  const [existing] = await db.select().from(schema.pdfFiles).where(eq(schema.pdfFiles.sha256, sha));
  if (existing) return Response.json({ id: existing.id, name: existing.name, url: existing.blobUrl, pages: existing.pages, pageCount: existing.pageCount });

  const stored = await putFile({ name: file.name, mime: "application/pdf", bytes });
  const [row] = await db
    .insert(schema.pdfFiles)
    .values({ name: file.name, blobUrl: stored.url, sha256: sha, pageCount: pages.length, pages })
    .returning();
  return Response.json({ id: row!.id, name: row!.name, url: row!.blobUrl, pages, pageCount: pages.length });
}
