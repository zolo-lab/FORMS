import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { storedFiles } = schema;

export const fileUrl = (id: string) => `/api/admin/files/${id}`;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function putFile(input: { name: string; mime: string; bytes: Uint8Array }): Promise<{ id: string; url: string; sha256: string }> {
  const sha256 = sha256Hex(input.bytes);
  const [row] = await db
    .insert(storedFiles)
    .values({ name: input.name, mime: input.mime, size: input.bytes.byteLength, sha256, dataBase64: Buffer.from(input.bytes).toString("base64") })
    .returning({ id: storedFiles.id });
  return { id: row!.id, url: fileUrl(row!.id), sha256 };
}

export async function getFile(id: string): Promise<{ name: string; mime: string; bytes: Uint8Array } | null> {
  const [row] = await db.select().from(storedFiles).where(eq(storedFiles.id, id));
  return row ? { name: row.name, mime: row.mime, bytes: new Uint8Array(Buffer.from(row.dataBase64, "base64")) } : null;
}
