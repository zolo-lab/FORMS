"use server";
import { revalidatePath } from "next/cache";
import { requireGrant } from "@/server/guards";
import {
  addField,
  addList,
  createListType,
  deleteField,
  deleteList,
  deleteListType,
  fieldUsage,
  listTypeUsage,
  renameListType,
  setCell,
  updateField,
  type FieldInput,
  type Result,
} from "@/server/lists-store";

const PATH = "/admin/lists";
const ID = /^([0-9a-f-]{36}|org|org:(name|reg))$/i;

/** Every action answers the same way: it took, or why not in Hebrew. A thrown error becomes a plain failure. */
async function run<T extends object>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  await requireGrant("manageFields");
  try {
    const r = await fn();
    if (r.ok) revalidatePath(PATH);
    return r;
  } catch (e) {
    console.error("[lists]", e);
    return { ok: false, error: "השמירה נכשלה – נסו שוב" };
  }
}
const bad = { ok: false as const, error: "קלט לא תקין" };

export async function createTypeAction(name: string, fields: { label: string; kind: string }[]) {
  return run(() => createListType(String(name ?? ""), Array.isArray(fields) ? fields.slice(0, 20) : []));
}
export async function renameTypeAction(id: string, name: string) {
  return ID.test(id) ? run(() => renameListType(id, String(name ?? ""))) : bad;
}
export async function typeUsageAction(id: string) {
  await requireGrant("manageFields");
  return ID.test(id) ? listTypeUsage(id) : { lists: 0, pointedBy: [] };
}
export async function deleteTypeAction(id: string) {
  return ID.test(id) ? run(() => deleteListType(id)) : bad;
}

export async function addFieldAction(typeId: string, input: FieldInput) {
  return ID.test(typeId) ? run(() => addField(typeId, input)) : bad;
}
export async function updateFieldAction(fieldId: string, patch: { label?: string; options?: string[]; multi?: boolean }) {
  return ID.test(fieldId) ? run(() => updateField(fieldId, patch)) : bad;
}
export async function fieldUsageAction(typeId: string, key: string) {
  await requireGrant("manageFields");
  return ID.test(typeId) && typeof key === "string" ? fieldUsage(typeId, key) : { filled: 0 };
}
export async function deleteFieldAction(fieldId: string) {
  return ID.test(fieldId) ? run(() => deleteField(fieldId)) : bad;
}

export async function addListAction(typeId: string, org?: { name: string; registrationNumber: string }) {
  return ID.test(typeId) ? run(() => addList(typeId, org)) : bad;
}
export async function deleteListAction(typeId: string, id: string) {
  return ID.test(typeId) && ID.test(id) ? run(() => deleteList(typeId, id)) : bad;
}
export async function setCellAction(typeId: string, listId: string, key: string, value: string | string[]) {
  return ID.test(typeId) && ID.test(listId) && typeof key === "string" ? run(() => setCell(typeId, listId, key, value)) : bad;
}
