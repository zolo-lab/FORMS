import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getFile } from "@/server/storage";

/** Public on purpose: the logo is shown on signing pages opened by people without a login. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug));
  if (!org?.logoFileId) return new Response("Not found", { status: 404 });
  const file = await getFile(org.logoFileId);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.bytes as BodyInit, { headers: { "content-type": file.mime, "cache-control": "public, max-age=300" } });
}
