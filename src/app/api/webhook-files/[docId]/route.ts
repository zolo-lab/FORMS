import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { verifyFileLink } from "@/lib/webhooks/sign";
import { getFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Final PDF through a signed, expiring link (what webhook payloads contain). No login: the signature is the access. */
export async function GET(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(docId) || !/^[0-9a-f]{64}$/.test(sig) || !verifyFileLink(process.env.SESSION_SECRET ?? "", docId, exp, sig)) {
    return NextResponse.json({ error: "invalid or expired link" }, { status: 403 });
  }
  const [doc] = await db.select().from(schema.packageDocuments).where(eq(schema.packageDocuments.id, docId));
  if (!doc?.finalFileId) return NextResponse.json({ error: "not found" }, { status: 404 });
  const file = await getFile(doc.finalFileId);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="document-${docId}.pdf"`, "cache-control": "private, no-store" },
  });
}
