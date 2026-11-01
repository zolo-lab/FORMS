import { publicFormPdf } from "@/server/public-fill";

/** The document of a form that is open by its link (published, first step is the sender or the employee). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = new URL(req.url).searchParams.get("org");
  const bytes = await publicFormPdf(id, org && /^[a-z0-9-]{1,60}$/.test(org) ? org : null);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(bytes as BodyInit, { headers: { "content-type": "application/pdf", "cache-control": "private, max-age=300" } });
}
