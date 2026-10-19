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
  /** ID number of the person (payroll layout puts it in the file name). */
  subjectIdNumber?: string | null;
  requestId: string;
  signedAt: Date;
}

/**
 * Two layouts:
 *  - simple (default): `<organization>/<form type>/<year>/<form> – <subject> – <date> – <id>.pdf`
 *  - payroll (GOOGLE_DRIVE_LAYOUT=payroll): the folders the payroll team already uses –
 *    forms whose title contains "101" → `שכר <organization>/<year>/101_<year>`,
 *    everything else → `שכר <organization>/מסמכי עובדים/<form type>`; file `<form type> - <subject> <id number>.pdf`.
 */
export type ArchiveLayout = "simple" | "payroll";

export function archiveLayoutFromEnv(v: string | undefined): ArchiveLayout {
  return v === "payroll" ? "payroll" : "simple";
}

const is101 = (title: string) => /(^|\D)101(\D|$)/.test(title);

export function payrollFolders(i: Pick<ArchiveInput, "organization" | "formTitle" | "signedAt">): string[] {
  const org = `שכר ${safeSegment(i.organization, "ארגון לא ידוע")}`;
  if (is101(i.formTitle)) {
    const y = archiveYear(i.signedAt);
    return [org, y, `101_${y}`];
  }
  return [org, "מסמכי עובדים", safeSegment(i.formTitle, "טופס")];
}

export function payrollFileName(i: Pick<ArchiveInput, "formTitle" | "subject" | "subjectIdNumber" | "requestId">): string {
  const who = [safeSegment(i.subject, "ללא נמען"), (i.subjectIdNumber ?? "").replace(/\D/g, "")].filter(Boolean).join(" ");
  const tag = i.subjectIdNumber ? "" : ` ${i.requestId.replace(/-/g, "").slice(0, 8)}`;
  return `${safeSegment(i.formTitle, "טופס")} - ${who}${tag}.pdf`;
}

/** Folders and file name for the chosen layout. */
export function archiveTarget(i: ArchiveInput, layout: ArchiveLayout): { folders: string[]; fileName: string } {
  return layout === "payroll" ? { folders: payrollFolders(i), fileName: payrollFileName(i) } : { folders: archiveFolders(i), fileName: archiveFileName(i) };
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
