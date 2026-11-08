"use server";
import { revalidatePath } from "next/cache";
import { requireGrant } from "@/server/guards";
import { createOrgFieldDef, deleteOrgFieldDef, orgFieldUsage, setOrgFieldValue, updateOrgFieldDef } from "@/server/orgs-store";

const PATH = "/admin/lists";
const UUID = /^[0-9a-f-]{36}$/i;

/** What every action of the sheet answers with: the cell or column either took, or says in Hebrew why not. */
export type SheetResult = { ok: true } | { ok: false; error: string };

const ERRORS = {
  label: "צריך שם לעמודה",
  exists: "כבר יש עמודה בשם הזה",
  key: "השם הפנימי לא תקין",
  type: "עמודה של עמותה מקבלת רק סוג של שורה אחת",
  missing: "העמודה לא נמצאה",
  input: "קלט לא תקין",
} as const satisfies Record<string, string>;
const errorOf = (reason: string) => (ERRORS as Record<string, string>)[reason] ?? ERRORS.input;

/** One cell: this organization's value for one column. Saved the moment the admin leaves the cell. */
export async function saveCellAction(orgId: string, key: string, value: string): Promise<SheetResult> {
  await requireGrant("manageFields");
  if (!UUID.test(orgId) || typeof key !== "string" || typeof value !== "string") return { ok: false, error: ERRORS.input };
  const ok = await setOrgFieldValue(orgId, key, value.slice(0, 200));
  if (!ok) return { ok: false, error: ERRORS.missing };
  revalidatePath(PATH);
  return { ok: true };
}

/** A new column for every organization at once. People type the Hebrew name; the internal name is made from it. */
export async function addColumnAction(label: string, type: string): Promise<SheetResult & { key?: string }> {
  await requireGrant("manageFields");
  const r = await createOrgFieldDef({ label, type });
  if (!r.ok) return { ok: false, error: errorOf(r.reason) };
  revalidatePath(PATH);
  revalidatePath("/admin/forms", "layout");
  return { ok: true, key: r.key };
}

/** The Hebrew name or the type of a column; the internal name does not move. */
export async function updateColumnAction(id: string, patch: { label?: string; type?: string }): Promise<SheetResult> {
  await requireGrant("manageFields");
  if (!UUID.test(id)) return { ok: false, error: ERRORS.input };
  const label = patch.label?.trim();
  if (patch.label !== undefined && !label) return { ok: false, error: ERRORS.label };
  const r = await updateOrgFieldDef(id, { label, type: patch.type });
  if (!r.ok) return { ok: false, error: errorOf(r.reason) };
  revalidatePath(PATH);
  revalidatePath("/admin/forms", "layout");
  return { ok: true };
}

/** What deleting this column would touch, for the confirmation. */
export async function columnUsageAction(key: string) {
  await requireGrant("manageFields");
  return orgFieldUsage(key);
}

/** Drops the column everywhere, with every organization's value for it. The impact was shown first. */
export async function deleteColumnAction(id: string): Promise<SheetResult> {
  await requireGrant("manageFields");
  if (!UUID.test(id)) return { ok: false, error: ERRORS.input };
  await deleteOrgFieldDef(id);
  revalidatePath(PATH);
  revalidatePath("/admin/forms", "layout");
  return { ok: true };
}
