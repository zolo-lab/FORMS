/**
 * Where a signed PDF is filed in the Drive archive: `<organization>/<form type>/<year>/<file name>`.
 * Pure (no network), so the layout is unit tested. The system itself never depends on this layout:
 * it keeps the Drive file id and link on the document row.
 */

const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f‎‏‪-‮]/g;

/** One safe folder or file name segment: no separators or control/bidi marks, collapsed spaces, bounded length. */
export function safeSegment(raw: string, fallback = "ללא שם"): string {
  const s = raw.replace(FORBIDDEN, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 80).trim();
  return s || fallback;
}

/** Calendar year in Israel time (a signature just after midnight on 1 Jan belongs to the new year). */
export function archiveYear(signedAt: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric" }).format(signedAt);
}

function archiveDay(signedAt: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(signedAt);
}

export interface ArchiveInput {
  organization: string;
  formTitle: string;
  subject: string;
  requestId: string;
  signedAt: Date;
}

/** Folder segments below the archive root. */
export function archiveFolders(i: Pick<ArchiveInput, "organization" | "formTitle" | "signedAt">): string[] {
  return [safeSegment(i.organization, "ארגון לא ידוע"), safeSegment(i.formTitle, "טופס"), archiveYear(i.signedAt)];
}

/** `<form> – <subject> – <yyyy-mm-dd> – <first 8 of the request id>.pdf`, enough to recognise the file outside the system. */
export function archiveFileName(i: Pick<ArchiveInput, "formTitle" | "subject" | "requestId" | "signedAt">): string {
  const parts = [safeSegment(i.formTitle, "טופס"), safeSegment(i.subject, "ללא נמען"), archiveDay(i.signedAt), i.requestId.replace(/-/g, "").slice(0, 8)];
  return `${parts.join(" – ")}.pdf`;
}
