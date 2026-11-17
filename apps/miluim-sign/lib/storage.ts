import { get, put } from "@vercel/blob";

export function isBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function token(): string {
  const value = process.env.BLOB_READ_WRITE_TOKEN;
  if (!value) throw new Error("BLOB_READ_WRITE_TOKEN missing");
  return value;
}

/** Stores bytes privately and returns the blob URL (unguessable, not public). */
export async function putBytes(bytes: Uint8Array, contentType: string): Promise<string> {
  const blob = await put(`miluim/${crypto.randomUUID()}`, Buffer.from(bytes), {
    access: "private",
    token: token(),
    contentType,
    addRandomSuffix: true,
  });
  return blob.url;
}

export async function readBytes(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!url.startsWith("https://")) return null;
  const result = await get(url, { access: "private", token: token() });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const buf = await new Response(result.stream).arrayBuffer();
  return { bytes: new Uint8Array(buf), type: result.blob.contentType || "application/octet-stream" };
}
