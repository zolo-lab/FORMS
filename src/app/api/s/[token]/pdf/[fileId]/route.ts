import { getPdfForToken } from "@/server/signing";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(fileId)) return new Response("Not found", { status: 404 });
  const f = await getPdfForToken(token, fileId);
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(f.bytes as BodyInit, { headers: { "content-type": "application/pdf", "cache-control": "private, max-age=300" } });
}
