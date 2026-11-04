import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getFile } from "@/server/storage";
import { canSeeRequest } from "@/server/users-store";
import { collectedAnswers } from "@/server/requests-store";
import { stampPdf } from "@/lib/forms/pdf-mapping";

const UUID = /^[0-9a-f-]{36}$/i;

const pdf = (bytes: Uint8Array, name: string) =>
  new Response(bytes as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    },
  });

/**
 * One package document as a PDF (admin only: /api/admin is behind the session guard).
 * The signed final file once it exists; before that (or with ?current=1) the form's PDF with every answer
 * collected so far drawn in its place, so the admin sees what was already filled.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  if (!UUID.test(id) || !UUID.test(docId)) return new Response("not found", { status: 404 });
  // Only someone who may see the request (never a tracking-only user) gets its PDFs.
  if (!(await canSeeRequest(id))) return new Response("not found", { status: 404 });
  const [doc] = await db.select().from(schema.packageDocuments).where(eq(schema.packageDocuments.id, docId));
  if (!doc || doc.requestId !== id) return new Response("not found", { status: 404 });
  const current = new URL(req.url).searchParams.get("current") === "1";
  if (doc.finalFileId && !current) {
    const file = await getFile(doc.finalFileId);
    return file ? pdf(file.bytes, file.name) : new Response("not found", { status: 404 });
  }
  const [version] = await db.select().from(schema.formTemplateVersions).where(eq(schema.formTemplateVersions.id, doc.templateVersionId));
  if (!version?.pdfFileId || !version.pdfMapping) return new Response("not found", { status: 404 });
  const [row] = await db.select().from(schema.pdfFiles).where(eq(schema.pdfFiles.id, version.pdfFileId));
  const storedId = row ? /([0-9a-f-]{36})$/.exec(row.blobUrl)?.[1] : undefined;
  const file = storedId ? await getFile(storedId) : null;
  if (!file) return new Response("not found", { status: 404 });
  const bytes = await stampPdf(file.bytes, version.pdfMapping, version.definition, await collectedAnswers(id));
  return pdf(bytes, `${version.definition.title}.pdf`);
}
