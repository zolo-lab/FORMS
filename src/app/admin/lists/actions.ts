"use server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth/permissions";
import { requireGrant } from "@/server/guards";
import { currentUser } from "@/server/users-store";
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
  ORG_TYPE,
  type FieldInput,
  type Result,
} from "@/server/lists-store";

const PATH = "/admin/lists";
const ID = /^([0-9a-f-]{36}|org|org:(name|reg))$/i;

/**
 * Every action answers the same way: it took, or why not in Hebrew. A thrown error becomes a plain failure, logged by
 * name only – a failed query carries its parameters, which can be ID numbers or phones.
 * The organizations type is admins' only, as on the organizations screen; the other types need `manageFields`.
 */
async function run<T extends object>(typeId: string, fn: () => Promise<Result<T>>): Promise<Result<T>> {
  await requireGrant("manageFields");
  if (typeId === ORG_TYPE && !isAdmin(await currentUser())) return { ok: false, error: "רק מנהל מערכת עורך עמותות" };
  try {
    const r = await fn();
    if (r.ok) revalidatePath(PATH);
    return r;
  } catch (e) {
    console.error("[lists] action failed:", e instanceof Error ? e.name : typeof e);
    return { ok: false, error: "השמירה נכשלה – נסו שוב" };
  }
}
const bad = { ok: false as const, error: "קלט לא תקין" };

export async function createTypeAction(name: string, fields: { label: string; kind: string }[]) {
  return run("", () => createListType(String(name ?? ""), Array.isArray(fields) ? fields.slice(0, 20) : []));
}
export async function renameTypeAction(id: string, name: string) {
  return ID.test(id) ? run(id, () => renameListType(id, String(name ?? ""))) : bad;
}
export async function typeUsageAction(id: string) {
  await requireGrant("manageFields");
  return ID.test(id) ? listTypeUsage(id) : { lists: 0, pointedBy: [] };
}
export async function deleteTypeAction(id: string) {
  return ID.test(id) ? run(id, () => deleteListType(id)) : bad;
}

export async function addFieldAction(typeId: string, input: FieldInput) {
  return ID.test(typeId) ? run(typeId, () => addField(typeId, input)) : bad;
}
export async function updateFieldAction(typeId: string, fieldId: string, patch: { label?: string; options?: string[]; multi?: boolean }) {
  return ID.test(typeId) && ID.test(fieldId) ? run(typeId, () => updateField(typeId, fieldId, patch)) : bad;
}
export async function fieldUsageAction(typeId: string, key: string) {
  await requireGrant("manageFields");
  return ID.test(typeId) && typeof key === "string" ? fieldUsage(typeId, key) : { filled: 0 };
}
export async function deleteFieldAction(typeId: string, fieldId: string) {
  return ID.test(typeId) && ID.test(fieldId) ? run(typeId, () => deleteField(typeId, fieldId)) : bad;
}

export async function addListAction(typeId: string, org?: { name: string; registrationNumber: string }) {
  return ID.test(typeId) ? run(typeId, () => addList(typeId, org)) : bad;
}
export async function deleteListAction(typeId: string, id: string) {
  return ID.test(typeId) && ID.test(id) ? run(typeId, () => deleteList(typeId, id)) : bad;
}
export async function setCellAction(typeId: string, listId: string, key: string, value: string | string[]) {
  return ID.test(typeId) && ID.test(listId) && typeof key === "string" ? run(typeId, () => setCell(typeId, listId, key, value)) : bad;
}
