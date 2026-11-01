import { publicFormPdf } from "@/server/public-fill";

/** The document of a form that is open by its link (published, first step is the sender or the employee). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bytes = await publicFormPdf(id);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(bytes as BodyInit, { headers: { "content-type": "application/pdf", "cache-control": "private, max-age=300" } });
}
