import { partFile } from "@/server/deliver";
import { canSeeRequest } from "@/server/users-store";

const UUID = /^[0-9a-f-]{36}$/i;
const PART_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * One cut part of a request as a PDF, cut on the way out of the signed document — nothing is stored.
 * Downloaded by hand here, mailed by a destination there, from the same code, so the two cannot drift.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; partId: string }> }) {
  const { id, partId } = await params;
  if (!UUID.test(id) || !PART_ID.test(partId)) return new Response("not found", { status: 404 });
  // Only someone who may see the request (never a tracking-only user) gets its PDFs.
  if (!(await canSeeRequest(id))) return new Response("not found", { status: 404 });
  const file = await partFile(id, partId);
  if (!file) return new Response("not found", { status: 404 });
  // Downloaded rather than previewed: this is a cut of the document, usually filed or forwarded, not read here.
  const disposition = new URL(req.url).searchParams.get("inline") === "1" ? "inline" : "attachment";
  return new Response(file.bytes as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "cache-control": "private, no-store",
    },
  });
}
