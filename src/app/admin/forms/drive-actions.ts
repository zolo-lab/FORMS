"use server";
import { requireGrant } from "@/server/guards";
import { existingFolders, listFolders } from "@/server/drive";
import { resolvePath, type PathContext } from "@/lib/processing/path";

/** Folders under one folder of the connected Drive, for the picker in "עיבוד טופס". */
export async function listDriveFoldersAction(parentId?: string): Promise<{ ok: boolean; folders: { id: string; name: string }[]; message?: string }> {
  await requireGrant("manageForms");
  try {
    const folders = await listFolders(parentId);
    if (!folders) return { ok: false, folders: [], message: "ארכיון Drive לא מוגדר" };
    return { ok: true, folders };
  } catch (e) {
    return { ok: false, folders: [], message: e instanceof Error ? e.message : "הקריאה ל-Drive נכשלה" };
  }
}

/**
 * What a path template becomes, and which of its folders already exist — so the builder can say
 * "ייווצרו 2 תיקיות חדשות" before anything is sent.
 */
export async function checkDrivePathAction(template: string, sample: PathContext & { signedAtIso?: string }): Promise<{ ok: boolean; segments: string[]; existing: number; unknown: string[]; missing: string[]; message?: string }> {
  await requireGrant("manageForms");
  const ctx: PathContext = { ...sample, signedAt: sample.signedAtIso ? new Date(sample.signedAtIso) : new Date() };
  const { segments, unknown, missing } = resolvePath(template, ctx);
  if (unknown.length) return { ok: false, segments, existing: 0, unknown, missing, message: `משתנה לא מוכר: ${unknown.join(", ")}` };
  try {
    const found = await existingFolders(undefined, segments);
    if (!found) return { ok: false, segments, existing: 0, unknown, missing, message: "ארכיון Drive לא מוגדר" };
    return { ok: true, segments, existing: found.length, unknown, missing };
  } catch (e) {
    return { ok: false, segments, existing: 0, unknown, missing, message: e instanceof Error ? e.message : "הבדיקה נכשלה" };
  }
}
