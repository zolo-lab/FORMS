"use server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { autoMap, buildRecords, findDuplicates, targetsFor, validateRecord, type ImportRecord, type RowError, type Target } from "@/lib/import/map";
import { MAX_ROWS, parseSheet } from "@/lib/import/sheet";
import { getWizardPackage } from "@/server/packages-store";
import { createRequest, sendRequest } from "@/server/requests-store";
import { viewer } from "@/server/users-store";
import { listProjects } from "@/server/orgs-store";
import { can, orgAllowed } from "@/lib/auth/permissions";

/** Same rule as the single-request wizard: the package must be openable and the organization allowed. */
async function mayCreate(packageId: string, organizationId: string, projectId?: string): Promise<boolean> {
  const { user, perms, access } = await viewer();
  return can(user, perms, packageId, "open") && orgAllowed(user, access, organizationId, projectId);
}

/** The project must exist, belong to the organization and be active. */
async function projectOk(organizationId: string, projectId?: string): Promise<boolean> {
  if (!projectId) return true;
  if (!UUID.test(projectId)) return false;
  const p = (await listProjects()).find((x) => x.id === projectId);
  return !!p && p.organizationId === organizationId && p.active;
}

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_ERRORS_SHOWN = 300;

export type ParseResult =
  | { ok: true; rows: string[][]; targets: Target[]; mapping: Record<string, number | null> }
  | { ok: false; error: string };

/** Step 1: read the uploaded file and propose a column mapping. */
export async function parseImportAction(fd: FormData): Promise<ParseResult> {
  const packageId = String(fd.get("packageId") ?? "");
  const file = fd.get("file");
  if (!UUID.test(packageId)) return { ok: false, error: "יש לבחור ערכה" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "יש לבחור קובץ" };
  if (file.size > MAX_FILE) return { ok: false, error: "הקובץ גדול מדי (עד 2MB)" };
  const pkg = await getWizardPackage(packageId);
  if (!pkg) return { ok: false, error: "הערכה לא נמצאה" };
  let rows: string[][];
  try {
    rows = parseSheet(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message.startsWith("too many") ? `יותר מדי שורות (עד ${MAX_ROWS})` : "לא הצלחנו לקרוא את הקובץ. נדרש XLSX או CSV" };
  }
  if (rows.length < 2) return { ok: false, error: "הקובץ ריק: נדרשת שורת כותרות ולפחות שורה אחת" };
  const targets = targetsFor(pkg.requesterDefinition);
  return { ok: true, rows, targets, mapping: autoMap(rows[0]!, targets) };
}

export type CheckResult =
  | { ok: true; total: number; valid: number; errors: RowError[]; records: ImportRecord[]; truncated: boolean }
  | { ok: false; error: string };

/** Step 2: convert + validate every row; returns the creatable records and the errors per row. */
export async function checkImportAction(input: { packageId: string; rows: string[][]; mapping: Record<string, number | null>; send: boolean }): Promise<CheckResult> {
  if (!UUID.test(input.packageId)) return { ok: false, error: "ערכה לא תקינה" };
  if (input.mapping["subject.name"] === null || input.mapping["subject.name"] === undefined) return { ok: false, error: "יש למפות את עמודת שם העובד" };
  if (!Array.isArray(input.rows) || input.rows.length > MAX_ROWS + 1) return { ok: false, error: "נתונים לא תקינים" };
  const pkg = await getWizardPackage(input.packageId);
  if (!pkg) return { ok: false, error: "הערכה לא נמצאה" };
  const records = buildRecords(input.rows, input.mapping, pkg.requesterDefinition);
  const errors: RowError[] = [];
  const good: ImportRecord[] = [];
  const dupRows = new Map(findDuplicates(records).map((d) => [d.row, d.message]));
  for (const r of records) {
    const errs = validateRecord(r, pkg.requesterDefinition, { send: input.send });
    const dup = dupRows.get(r.row);
    if (dup) errs.push(dup);
    if (errs.length) errors.push({ row: r.row, message: errs.join("; ") });
    else good.push(r);
  }
  return { ok: true, total: records.length, valid: good.length, errors: errors.slice(0, MAX_ERRORS_SHOWN), truncated: errors.length > MAX_ERRORS_SHOWN, records: good };
}

export async function startImportJobAction(input: { packageId: string; organizationId: string; projectId?: string; rowCount: number; campaign?: string }): Promise<{ jobId: string } | { error: string }> {
  if (!UUID.test(input.packageId) || !UUID.test(input.organizationId)) return { error: "נתונים לא תקינים" };
  if (!(await projectOk(input.organizationId, input.projectId))) return { error: "הפרויקט לא נמצא בעמותה הזו" };
  if (!(await mayCreate(input.packageId, input.organizationId, input.projectId))) return { error: "אין לך הרשאה לערכה, לארגון או לפרויקט האלה" };
  const [job] = await db.insert(schema.bulkJobs).values({ organizationId: input.organizationId, packageTemplateId: input.packageId, rowCount: input.rowCount, status: "running" }).returning({ id: schema.bulkJobs.id });
  return { jobId: job!.id };
}

export interface ChunkResult {
  created: number;
  errors: RowError[];
}

/** Step 3 (called repeatedly with small chunks so no single call times out). Everything is validated again here. */
export async function createImportChunkAction(input: { jobId: string; packageId: string; organizationId: string; projectId?: string; records: ImportRecord[]; send: boolean; final: boolean; campaign?: string }): Promise<ChunkResult> {
  const out: ChunkResult = { created: 0, errors: [] };
  if (!UUID.test(input.jobId) || !UUID.test(input.packageId) || !UUID.test(input.organizationId) || input.records.length > 25) {
    return { created: 0, errors: [{ row: 0, message: "בקשה לא תקינה" }] };
  }
  if (!(await projectOk(input.organizationId, input.projectId))) return { created: 0, errors: [{ row: 0, message: "הפרויקט לא נמצא בעמותה הזו" }] };
  if (!(await mayCreate(input.packageId, input.organizationId, input.projectId))) return { created: 0, errors: [{ row: 0, message: "אין לך הרשאה לערכה, לארגון או לפרויקט האלה" }] };
  const pkg = await getWizardPackage(input.packageId);
  if (!pkg) return { created: 0, errors: [{ row: 0, message: "הערכה לא נמצאה" }] };
  for (const rec of input.records) {
    const errs = validateRecord(rec, pkg.requesterDefinition, { send: input.send });
    if (errs.length) {
      out.errors.push({ row: rec.row, message: errs.join("; ") });
      continue;
    }
    try {
      const id = await createRequest({ packageTemplateId: pkg.id, organizationId: input.organizationId, projectId: input.projectId, subject: rec.subject, requesterAnswers: rec.answers, campaign: input.campaign });
      if (input.send) await sendRequest(id);
      out.created++;
    } catch (e) {
      out.errors.push({ row: rec.row, message: e instanceof Error ? e.message : "יצירה נכשלה" });
    }
  }
  const [job] = await db.select().from(schema.bulkJobs).where(eq(schema.bulkJobs.id, input.jobId));
  if (job) {
    await db
      .update(schema.bulkJobs)
      .set({ createdCount: sql`${schema.bulkJobs.createdCount} + ${out.created}`, errors: [...job.errors, ...out.errors].slice(0, 500), ...(input.final ? { status: "done" } : {}) })
      .where(eq(schema.bulkJobs.id, input.jobId));
  }
  return out;
}
