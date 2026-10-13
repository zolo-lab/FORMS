import { getFile } from "@/server/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const file = await getFile(id);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.bytes as BodyInit, {
    headers: {
      "content-type": file.mime,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "cache-control": "private, max-age=3600",
    },
  });
}
