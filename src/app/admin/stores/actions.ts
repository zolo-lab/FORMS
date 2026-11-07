"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireGrant } from "@/server/guards";
import { parseSheet } from "@/lib/import/sheet";
import { planImport } from "@/lib/stores/model";
import { addColumns, createStore, deleteStore, getStore, importRows, renameStore, saveStore } from "@/server/stores-store";

const UUID = /^[0-9a-f-]{36}$/i;
const PATH = "/admin/stores";

export async function createStoreAction(fd: FormData) {
  await requireGrant("manageForms");
  const name = String(fd.get("name") ?? "").trim();
  const labels = String(fd.get("columns") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!name) redirect(`${PATH}?error=name`);
  if (!labels.length) redirect(`${PATH}?error=columns`);
  const id = await createStore(name, labels);
  redirect(`${PATH}/${id}?saved=new`);
}

export async function renameStoreAction(fd: FormData) {
  await requireGrant("manageForms");
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!UUID.test(id) || !name) return;
  await renameStore(id, name, String(fd.get("description") ?? ""));
  revalidatePath(`${PATH}/${id}`);
}

export type SaveStoreResult = { ok: true } | { ok: false; error: string };

export async function saveStoreAction(id: string, input: { columns: { key?: string; label: string }[]; displayColumn: string | null; displayLabel?: string | null; rows: { id?: string; values: Record<string, string> }[] }): Promise<SaveStoreResult> {
  await requireGrant("manageForms");
  if (!UUID.test(id) || !input || !Array.isArray(input.columns) || !Array.isArray(input.rows)) return { ok: false, error: "קלט לא תקין" };
  const r = await saveStore(id, input);
  if (!r.ok) return { ok: false, error: r.reason === "columns" ? r.message! : r.reason === "tooMany" ? "יותר מדי שורות" : "המאגר לא נמצא" };
  revalidatePath(`${PATH}/${id}`);
  revalidatePath(PATH);
  return { ok: true };
}

/** Import an Excel / CSV sheet: headers are matched to the column names; unknown headers can become new columns. */
export async function importStoreAction(fd: FormData) {
  await requireGrant("manageForms");
  const id = String(fd.get("id") ?? "");
  const file = fd.get("file");
  if (!UUID.test(id) || !(file instanceof File) || file.size === 0) redirect(`${PATH}/${id}?error=file`);
  if (file.size > 5 * 1024 * 1024) redirect(`${PATH}/${id}?error=big`);
  let sheet: string[][];
  try {
    sheet = parseSheet(new Uint8Array(await file.arrayBuffer()));
  } catch {
    redirect(`${PATH}/${id}?error=parse`);
  }
  const data = await getStore(id);
  if (!data) redirect(PATH);
  let columns = data.store.columns;
  const first = planImport(sheet, columns);
  if (fd.get("addColumns") === "on" && first.unknownHeaders.length) columns = await addColumns(id, first.unknownHeaders);
  const plan = planImport(sheet, columns);
  if (!plan.rows.length) redirect(`${PATH}/${id}?error=empty`);
  const n = await importRows(id, plan.rows, fd.get("mode") === "replace" ? "replace" : "append");
  revalidatePath(`${PATH}/${id}`);
  const skipped = plan.unknownHeaders.length ? `&skipped=${encodeURIComponent(plan.unknownHeaders.join(", "))}` : "";
  const cut = n < plan.rows.length ? `&cut=${plan.rows.length - n}` : "";
  redirect(`${PATH}/${id}?saved=import&n=${n}${skipped}${cut}`);
}

export async function deleteStoreAction(fd: FormData) {
  await requireGrant("manageForms");
  const id = String(fd.get("id") ?? "");
  if (UUID.test(id)) await deleteStore(id);
  redirect(`${PATH}?saved=deleted`);
}
