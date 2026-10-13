/** Turn requests + their answers into a flat table: fixed columns, then one column per export key. */
import { formatAnswer } from "@/lib/forms/format";
import { allFields, type FormDefinition } from "@/lib/forms/schema";
import type { Answers } from "@/lib/forms/conditions";

export interface ExportRequest {
  id: string;
  subjectName: string;
  subjectIdNumber: string;
  organization: string;
  package: string;
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  answers: Answers;
  /** Definitions of the forms in the request (order matters for column order). */
  definitions: FormDefinition[];
}

const day = (d: Date | null) => (d ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(d) : "");

export const FIXED_HEADERS = ["מזהה בקשה", "שם", 'ת"ז', "ארגון", "ערכה", "סטטוס", "נוצרה", "יעד"];

/** Column key of a field: its export key, else its id. Signature, layout and table fields are not exported. */
function columnOf(f: { id: string; exportKey?: string; type: string }) {
  return f.exportKey?.trim() || f.id;
}
const SKIP = new Set(["signature", "repeating_table", "heading", "info_text", "image", "divider", "file_upload", "hidden"]);

export function buildExportTable(requests: ExportRequest[]): string[][] {
  const columns: string[] = [];
  /** Header text per column: the explicit export key when defined, else the Hebrew label. */
  const titles = new Map<string, string>();
  for (const r of requests) {
    for (const def of r.definitions) {
      for (const f of allFields(def)) {
        if (SKIP.has(f.type)) continue;
        const key = columnOf(f);
        if (!columns.includes(key)) {
          columns.push(key);
          titles.set(key, f.exportKey?.trim() || f.label || key);
        }
      }
    }
  }
  const rows = requests.map((r) => {
    const byKey = new Map<string, string>();
    for (const def of r.definitions) {
      for (const f of allFields(def)) {
        if (SKIP.has(f.type)) continue;
        const key = columnOf(f);
        if (byKey.has(key)) continue;
        byKey.set(key, formatAnswer(f, r.answers[f.id]));
      }
    }
    return [
      r.id,
      r.subjectName,
      r.subjectIdNumber,
      r.organization,
      r.package,
      r.status,
      day(r.createdAt),
      day(r.expiresAt),
      ...columns.map((c) => byKey.get(c) ?? ""),
    ];
  });
  return [[...FIXED_HEADERS, ...columns.map((c) => titles.get(c) ?? c)], ...rows];
}
