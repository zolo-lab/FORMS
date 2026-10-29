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
  /** Campaign tag ("101 2027"), when the request came from a tagged mass send. */
  campaign?: string | null;
  /** Handling steps after signing of the request's package, with the date each was ticked (null = not yet). */
  followUp?: { label: string; at: Date | null }[];
}

const day = (d: Date | null) => (d ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(d) : "");

export const FIXED_HEADERS = ["מזהה בקשה", "שם", 'ת"ז', "ארגון", "טופס", "סטטוס", "נוצרה", "יעד"];

/** Column key of a field: its export key, else its id. Layout fields and uploads are not exported. */
function columnOf(f: { id: string; exportKey?: string; type: string }) {
  return f.exportKey?.trim() || f.id;
}
const SKIP = new Set(["heading", "info_text", "image", "divider", "section", "link", "file_upload", "hidden"]);

interface Column { key: string; title: string; value: (r: ExportRequest) => string }

/** The ID number of the request, or (when the request was created without one) the answer of a field pre-filled from it. */
function subjectId(r: ExportRequest): string {
  if (r.subjectIdNumber) return r.subjectIdNumber;
  for (const def of r.definitions) {
    for (const f of allFields(def)) {
      const v = r.answers[f.id];
      if (f.prefill === "employee.idNumber" && typeof v === "string" && v) return v;
    }
  }
  return "";
}

/**
 * Fixed columns, then one column per field (first form wins on a shared key). A repeating table becomes
 * one column per row × column ("ילדים 1 – שם"), as many rows as the fullest request has; a signature shows "חתום".
 */
export function buildExportTable(requests: ExportRequest[]): string[][] {
  const columns: Column[] = [];
  const seen = new Set<string>();
  const add = (c: Column) => { if (!seen.has(c.key)) { seen.add(c.key); columns.push(c); } };
  for (const r of requests) {
    for (const def of r.definitions) {
      for (const f of allFields(def)) {
        if (SKIP.has(f.type)) continue;
        const key = columnOf(f);
        if (f.type === "repeating_table") {
          const rows = Math.max(0, ...requests.map((x) => (Array.isArray(x.answers[f.id]) ? (x.answers[f.id] as unknown[]).length : 0)));
          for (let i = 0; i < rows; i++) {
            for (const col of f.fields ?? []) {
              if (SKIP.has(col.type)) continue;
              add({
                key: `${key}[${i}].${columnOf(col)}`,
                title: `${f.exportKey?.trim() || f.label || key} ${i + 1} – ${col.exportKey?.trim() || col.label || col.id}`,
                value: (x) => {
                  const row = (x.answers[f.id] as Answers[] | undefined)?.[i];
                  return row ? formatAnswer(col, row[col.id]) : "";
                },
              });
            }
          }
          continue;
        }
        add({
          key,
          title: f.exportKey?.trim() || f.label || key,
          value: (x) => {
            for (const d of x.definitions) {
              const own = allFields(d).find((g) => columnOf(g) === key && !SKIP.has(g.type));
              if (!own) continue;
              const v = x.answers[own.id];
              if (own.type === "signature") return v ? "חתום" : "";
              return formatAnswer(own, v);
            }
            return "";
          },
        });
      }
    }
  }
  // Trailing columns: campaign (only when some request has one) and one date column per handling step after signing.
  const hasCampaign = requests.some((r) => !!r.campaign);
  const followLabels: string[] = [];
  for (const r of requests) for (const f of r.followUp ?? []) if (!followLabels.includes(f.label)) followLabels.push(f.label);
  const tail = (r: ExportRequest) => [
    ...(hasCampaign ? [r.campaign ?? ""] : []),
    ...followLabels.map((l) => day(r.followUp?.find((f) => f.label === l)?.at ?? null)),
  ];
  const tailHeaders = [...(hasCampaign ? ["קמפיין"] : []), ...followLabels.map((l) => `${l} – תאריך`)];
  const rows = requests.map((r) => [
    r.id,
    r.subjectName,
    subjectId(r),
    r.organization,
    r.package,
    r.status,
    day(r.createdAt),
    day(r.expiresAt),
    ...columns.map((c) => c.value(r)),
    ...tail(r),
  ]);
  return [[...FIXED_HEADERS, ...columns.map((c) => c.title), ...tailHeaders], ...rows];
}
