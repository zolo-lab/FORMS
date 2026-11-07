"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireGrant } from "@/server/guards";
import { createDictionaryEntry, deleteDictionaryEntry, updateDictionaryEntry, type DictionaryResult, type FieldCategory } from "@/server/field-dictionary-store";

const PATH = "/admin/fields";
const UUID = /^[0-9a-f-]{36}$/i;
const category = (v: FormDataEntryValue | null): FieldCategory => (v === "org" ? "org" : "general");
const fail = (r: Extract<DictionaryResult, { ok: false }>) => redirect(`${PATH}?error=${r.reason}`);

export async function createFieldAction(fd: FormData) {
  await requireGrant("manageFields");
  const r = await createDictionaryEntry({ label: String(fd.get("label") ?? ""), key: String(fd.get("key") ?? ""), type: String(fd.get("type") ?? ""), category: category(fd.get("category")) });
  if (!r.ok) fail(r);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=new&key=${encodeURIComponent(r.ok ? r.key : "")}`);
}

export async function updateFieldAction(fd: FormData) {
  await requireGrant("manageFields");
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) redirect(PATH);
  const r = await updateDictionaryEntry(id, category(fd.get("category")), { label: String(fd.get("label") ?? ""), type: String(fd.get("type") ?? ""), key: String(fd.get("key") ?? "") });
  if (!r.ok) fail(r);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=${id}`);
}

export async function deleteFieldAction(fd: FormData) {
  await requireGrant("manageFields");
  const id = String(fd.get("id") ?? "");
  if (UUID.test(id)) await deleteDictionaryEntry(id);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=deleted`);
}
