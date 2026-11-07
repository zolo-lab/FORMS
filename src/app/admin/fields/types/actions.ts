"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireGrant } from "@/server/guards";
import { createDictionaryEntry, listDictionary } from "@/server/field-dictionary-store";
import { appendFieldToType, createListType, deleteListType, saveListType } from "@/server/list-types-store";

const PATH = "/admin/fields/types";
const UUID = /^[0-9a-f-]{36}$/i;

export async function createListTypeAction(fd: FormData) {
  await requireGrant("manageFields");
  const id = await createListType(String(fd.get("name") ?? ""));
  if (!id) redirect(`${PATH}?nerror=name`);
  redirect(`${PATH}/${id}?saved=new`);
}

export type SaveTypeResult = { ok: true } | { ok: false; error: string };

/** Name, fields in order and the field that names a record: one save for the whole editor. */
export async function saveListTypeAction(id: string, input: { name: string; fields: string[]; displayKey: string | null }): Promise<SaveTypeResult> {
  await requireGrant("manageFields");
  if (!UUID.test(id) || !input || typeof input.name !== "string") return { ok: false, error: "קלט לא תקין" };
  // Only general fields: the organizations' fields belong to the built-in "עמותות" list.
  const known = (await listDictionary()).filter((f) => f.category === "general").map((f) => f.key);
  if (!(await saveListType(id, input, known))) return { ok: false, error: "צריך שם לסוג הרשימה" };
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return { ok: true };
}

/** A new field typed in the type's screen: it goes into the central dictionary, and onto this type. */
export async function addNewFieldToTypeAction(fd: FormData) {
  await requireGrant("manageFields");
  const id = String(fd.get("typeId") ?? "");
  if (!UUID.test(id)) redirect(PATH);
  const r = await createDictionaryEntry({ label: String(fd.get("label") ?? ""), key: String(fd.get("key") ?? ""), type: String(fd.get("type") ?? ""), category: "general" });
  if (!r.ok) redirect(`${PATH}/${id}?error=${r.reason}`);
  await appendFieldToType(id, r.key);
  revalidatePath(`${PATH}/${id}`);
  redirect(`${PATH}/${id}?saved=field`);
}

export async function deleteListTypeAction(fd: FormData) {
  await requireGrant("manageFields");
  const id = String(fd.get("id") ?? "");
  if (UUID.test(id)) await deleteListType(id);
  redirect(`${PATH}?saved=deleted`);
}
