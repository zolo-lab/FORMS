import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getFile } from "@/server/storage";
import { canSeeRequest } from "@/server/users-store";

const UUID = /^[0-9a-f-]{36}$/i;

/** Final PDF of one package document (admin only: /api/admin is behind the session guard). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  if (!UUID.test(id) || !UUID.test(docId)) return new Response("not found", { status: 404 });
  // Only someone who may see the request (never a tracking-only user) gets its signed PDFs.
  if (!(await canSeeRequest(id))) return new Response("not found", { status: 404 });
  const [doc] = await db.select().from(schema.packageDocuments).where(eq(schema.packageDocuments.id, docId));
  if (!doc || doc.requestId !== id || !doc.finalFileId) return new Response("not found", { status: 404 });
  const file = await getFile(doc.finalFileId);
  if (!file) return new Response("not found", { status: 404 });
  return new Response(file.bytes as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "cache-control": "private, no-store",
    },
  });
}
