"use server";
import { revalidatePath } from "next/cache";
import { requireGrant } from "@/server/guards";
import { cleanRecord, MAX_RECORDS } from "@/lib/fields/record";
import { listDictionary } from "@/server/field-dictionary-store";
import { deleteRecord, getListType, recordCount, saveRecord } from "@/server/list-types-store";

const UUID = /^[0-9a-f-]{36}$/i;
const PATH = "/admin/fields/records";

export type SaveRecordResult = { ok: true } | { ok: false; error?: string; problems?: Record<string, string> };

/** One record (a supplier…): values of the type's fields only, each checked against its field's type. */
export async function saveRecordAction(typeId: string, id: string | null, values: Record<string, string>): Promise<SaveRecordResult> {
  await requireGrant("manageFields");
  if (!UUID.test(typeId) || (id !== null && !UUID.test(id))) return { ok: false, error: "קלט לא תקין" };
  const type = await getListType(typeId);
  if (!type) return { ok: false, error: "סוג הרשימה לא נמצא" };
  const dict = new Map((await listDictionary()).map((f) => [f.key, f]));
  const fields = type.fields.flatMap((k) => (dict.has(k) ? [{ key: k, label: dict.get(k)!.label, type: dict.get(k)!.type }] : []));
  const r = cleanRecord(values, fields);
  if (Object.keys(r.problems).length) return { ok: false, problems: r.problems };
  if (!Object.keys(r.values).length) return { ok: false, error: "צריך למלא לפחות שדה אחד" };
  if (!id && (await recordCount(typeId)) >= MAX_RECORDS) return { ok: false, error: `ברשימה אפשר עד ${MAX_RECORDS} רשומות` };
  if (!(await saveRecord(typeId, id, r.values, fields.map((f) => f.key)))) return { ok: false, error: "הרשומה נמחקה בינתיים. רעננו את הדף." };
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteRecordAction(typeId: string, id: string): Promise<void> {
  await requireGrant("manageFields");
  if (UUID.test(typeId) && UUID.test(id)) await deleteRecord(typeId, id);
  revalidatePath(PATH);
}
