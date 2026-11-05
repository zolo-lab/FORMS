/**
 * Every stored file a request owns, so deleting the request takes its bytes with it.
 *
 * The request row cascades to its own tables, but `stored_files` is referenced by plain id — from a
 * document's `final_file_id`, a signature, an upload inside the answers, and a part a destination cut on
 * the way out — so nothing in the database removes those rows, and their Blob objects stay paid for.
 */
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { fileIdsInAnswers } from "@/lib/requests/file-ids";
import { deleteFile } from "./storage";

const { packageDocuments, signatures, signingSteps, submissions, notifications } = schema;

/**
 * Every stored file the given requests own. Collect this *before* deleting the rows: once they cascade
 * away there is nothing left pointing at the files.
 */
export async function fileIdsOfRequests(requestIds: string[]): Promise<string[]> {
  if (!requestIds.length) return [];
  const ids = new Set<string>();

  const docs = await db
    .select({ fileId: packageDocuments.finalFileId })
    .from(packageDocuments)
    .where(inArray(packageDocuments.requestId, requestIds));
  for (const d of docs) if (d.fileId) ids.add(d.fileId);

  const sigs = await db
    .select({ fileId: signatures.fileId })
    .from(signatures)
    .innerJoin(signingSteps, eq(signingSteps.id, signatures.stepId))
    .where(inArray(signingSteps.requestId, requestIds));
  for (const s of sigs) if (s.fileId) ids.add(s.fileId);

  const subs = await db.select({ answers: submissions.answers }).from(submissions).where(inArray(submissions.requestId, requestIds));
  for (const s of subs) for (const id of fileIdsInAnswers(s.answers)) ids.add(id);

  // Parts "עיבוד טופס" cut on the way out live only on the mail that carries them.
  const mails = await db.select({ attach: notifications.attachFileIds }).from(notifications).where(inArray(notifications.requestId, requestIds));
  for (const m of mails) for (const id of m.attach ?? []) ids.add(id);

  return [...ids];
}

/**
 * Deletes the stored files whose ids were collected before the requests were removed. Best effort: a
 * file that fails to delete is one orphan, not a failed deletion the user has to repeat.
 */
export async function deleteStoredFiles(fileIds: string[]): Promise<number> {
  let gone = 0;
  for (const id of fileIds) {
    try {
      await deleteFile(id);
      gone++;
    } catch {
      // Leave it; the request is already gone and retrying the whole delete would not help.
    }
  }
  return gone;
}
