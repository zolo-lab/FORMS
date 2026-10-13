import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseFormDefinition } from "@/lib/forms/schema";
import { pdfMappingSchema, stampPdf } from "@/lib/forms/pdf-mapping";
import { sampleAnswersFor } from "@/lib/forms/sample-answers";
import { getFile } from "@/server/storage";

/** Fills the template PDF with sample (or provided) answers so the admin can check the placement. */
export async function POST(req: Request) {
  const body = (await req.json()) as { pdfFileId?: string; definition?: unknown; mapping?: unknown; answers?: Record<string, unknown> };
  const def = parseFormDefinition(body.definition);
  const mapping = pdfMappingSchema.safeParse(body.mapping);
  if (!def.success || !mapping.success || !body.pdfFileId || !/^[0-9a-f-]{36}$/.test(body.pdfFileId)) {
    return Response.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }
  const [pdf] = await db.select().from(schema.pdfFiles).where(eq(schema.pdfFiles.id, body.pdfFileId));
  const stored = pdf && (await getFile(pdf.blobUrl.split("/").pop()!));
  if (!stored) return Response.json({ error: "קובץ ה-PDF לא נמצא" }, { status: 404 });
  const out = await stampPdf(stored.bytes, mapping.data, def.data, body.answers ?? sampleAnswersFor(def.data));
  return new Response(out as BodyInit, { headers: { "content-type": "application/pdf", "cache-control": "no-store" } });
}
