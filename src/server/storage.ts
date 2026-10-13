import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { del, get, put } from "@vercel/blob";
import { db, schema } from "@/db";

const { storedFiles } = schema;

export const fileUrl = (id: string) => `/api/admin/files/${id}`;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Blob object name for a stored file. Deterministic from the row id, so no schema change is needed. */
export const blobPathname = (id: string) => `files/${id}`;

/** Blob is used whenever its token is configured; otherwise files live in the DB row (dev / fallback). */
const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Metadata always lives in `stored_files`. With Blob enabled `dataBase64` is left empty and the bytes
 * live in a private Blob object; rows written before Blob was connected keep their inline data.
 */
export async function putFile(input: { name: string; mime: string; bytes: Uint8Array }): Promise<{ id: string; url: string; sha256: string }> {
  const sha256 = sha256Hex(input.bytes);
  const inBlob = blobEnabled();
  const [row] = await db
    .insert(storedFiles)
    .values({
      name: input.name,
      mime: input.mime,
      size: input.bytes.byteLength,
      sha256,
      dataBase64: inBlob ? "" : Buffer.from(input.bytes).toString("base64"),
    })
    .returning({ id: storedFiles.id });
  const id = row!.id;
  if (inBlob) {
    try {
      await put(blobPathname(id), Buffer.from(input.bytes), {
        access: "private",
        contentType: input.mime,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    } catch (e) {
      await db.delete(storedFiles).where(eq(storedFiles.id, id)).catch(() => {});
      throw e;
    }
  }
  return { id, url: fileUrl(id), sha256 };
}

export async function getFile(id: string): Promise<{ name: string; mime: string; bytes: Uint8Array } | null> {
  const [row] = await db.select().from(storedFiles).where(eq(storedFiles.id, id));
  if (!row) return null;
  if (row.dataBase64 !== "" || row.size === 0) {
    return { name: row.name, mime: row.mime, bytes: new Uint8Array(Buffer.from(row.dataBase64, "base64")) };
  }
  const res = await get(blobPathname(id), { access: "private" });
  if (!res || res.statusCode !== 200) return null;
  const bytes = new Uint8Array(await new Response(res.stream).arrayBuffer());
  return { name: row.name, mime: row.mime, bytes };
}

export async function deleteFile(id: string): Promise<void> {
  const [row] = await db.select().from(storedFiles).where(eq(storedFiles.id, id));
  if (!row) return;
  if (row.dataBase64 === "" && row.size > 0) await del(blobPathname(id)).catch(() => {});
  await db.delete(storedFiles).where(eq(storedFiles.id, id));
}
