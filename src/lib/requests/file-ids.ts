/**
 * Which stored files an answer holds. An upload field keeps the file's url, never the bare id, so this is
 * what a delete has to read to know which `stored_files` rows a request owns. Pure, so it can be tested
 * without a database.
 */
const FILE_URL = /\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

/** The stored-file id a file url points at, when it points at one. */
export function fileIdInUrl(url: string | null | undefined): string | null {
  const m = new RegExp(FILE_URL.source).exec(url ?? "");
  return m?.[1] ?? null;
}

/** Every stored-file id anywhere in an answers object, each once, whatever shape the field keeps. */
export function fileIdsInAnswers(answers: unknown): string[] {
  let text: string;
  try {
    text = JSON.stringify(answers ?? null) ?? "";
  } catch {
    return []; // A cyclic value cannot have come from the database; nothing to delete.
  }
  return [...new Set([...text.matchAll(FILE_URL)].map((m) => m[1]!))];
}
