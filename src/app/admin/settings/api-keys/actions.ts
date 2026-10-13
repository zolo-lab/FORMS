"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { generateApiKey } from "@/lib/api/keys";

const UUID = /^[0-9a-f-]{36}$/i;
const BASE = "/admin/settings/api-keys";

export type CreateKeyState = { key?: string; error?: string } | null;

/** Creates a key and returns it once; only its hash is stored, so it can't be shown again. */
export async function createApiKeyAction(_prev: CreateKeyState, fd: FormData): Promise<CreateKeyState> {
  const organizationId = String(fd.get("organizationId") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!UUID.test(organizationId)) return { error: "יש לבחור ארגון" };
  if (!name) return { error: "יש לתת שם למפתח (למשל: Make)" };
  const { key, hash } = generateApiKey();
  await db.insert(schema.apiKeys).values({ organizationId, name, keyHash: hash });
  revalidatePath(BASE);
  return { key };
}

export async function revokeApiKeyAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (UUID.test(id)) await db.update(schema.apiKeys).set({ revokedAt: new Date() }).where(eq(schema.apiKeys.id, id));
  revalidatePath(BASE);
  redirect(BASE);
}
