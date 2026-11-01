import { getPdfForToken } from "@/server/signing";

export async function GET(req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(fileId)) return new Response("Not found", { status: 404 });
  // ?filled=1: the PDF with the answers collected so far ("צפייה במסמך"), not the blank template.
  const filled = new URL(req.url).searchParams.get("filled") === "1";
  const f = await getPdfForToken(token, fileId, { filled });
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(f.bytes as BodyInit, { headers: { "content-type": "application/pdf", "cache-control": filled ? "no-store" : "private, max-age=300" } });
}
