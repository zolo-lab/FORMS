import { publicFormPdf } from "@/server/public-fill";

/** The document of a form that is open by its link (published, first step is the sender or the employee). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const ok = (v: string | null) => (v && /^[a-z0-9-]{1,60}$/.test(v) ? v : null);
  const bytes = await publicFormPdf(id, ok(q.get("org")), ok(q.get("org")) ? ok(q.get("project")) : null);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(bytes as BodyInit, { headers: { "content-type": "application/pdf", "cache-control": "private, max-age=300" } });
}
