/** Saved export templates and the definitions their columns map to. */
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FormDefinition } from "@/lib/forms/schema";
import { readTemplate, type ExportTemplate } from "@/lib/export/template";

const { exportTemplates, packageTemplates, packageTemplateItems, formTemplates, formTemplateVersions, requests } = schema;

/** Postgres 42P01 (table missing) until the migration is applied; Drizzle wraps it in `cause`. */
function isMissingRelation(e: unknown): boolean {
  for (let cur = e as { code?: string; message?: string; cause?: unknown } | undefined, i = 0; cur && i < 4; cur = cur.cause as typeof cur, i++) {
    if (cur.code === "42P01" || /does not exist/.test(String(cur.message ?? ""))) return true;
  }
  return false;
}

export interface ExportTemplateRow {
  id: string;
  name: string;
  packageTemplateId: string | null;
  packageName: string | null;
  template: ExportTemplate;
  updatedAt: Date;
}

export async function listExportTemplates(): Promise<ExportTemplateRow[]> {
  try {
    const rows = await db
      .select({ t: exportTemplates, pkg: packageTemplates.name })
      .from(exportTemplates)
      .leftJoin(packageTemplates, eq(packageTemplates.id, exportTemplates.packageTemplateId))
      .orderBy(asc(exportTemplates.name));
    return rows.map(({ t, pkg }) => ({ id: t.id, name: t.name, packageTemplateId: t.packageTemplateId, packageName: pkg, template: readTemplate(t.template), updatedAt: t.updatedAt }));
  } catch (e) {
    if (isMissingRelation(e)) return [];
    throw e;
  }
}

export async function getExportTemplate(id: string): Promise<ExportTemplateRow | null> {
  const all = await listExportTemplates();
  return all.find((t) => t.id === id) ?? null;
}

export async function createExportTemplate(name: string, packageTemplateId: string | null, template: ExportTemplate): Promise<string> {
  const [row] = await db.insert(exportTemplates).values({ name, packageTemplateId, template }).returning({ id: exportTemplates.id });
  return row!.id;
}

export async function updateExportTemplate(id: string, patch: { name?: string; packageTemplateId?: string | null; template?: ExportTemplate }) {
  await db.update(exportTemplates).set({ ...patch, updatedAt: new Date() }).where(eq(exportTemplates.id, id));
}

export async function deleteExportTemplate(id: string) {
  await db.delete(exportTemplates).where(eq(exportTemplates.id, id));
}

/** Published (else latest) definitions of the forms in a package, in package order. */
export async function packageDefinitions(packageTemplateId: string): Promise<FormDefinition[]> {
  const items = await db
    .select({ templateId: packageTemplateItems.templateId, published: formTemplates.publishedVersion })
    .from(packageTemplateItems)
    .innerJoin(formTemplates, eq(formTemplates.id, packageTemplateItems.templateId))
    .where(eq(packageTemplateItems.packageTemplateId, packageTemplateId))
    .orderBy(asc(packageTemplateItems.order));
  if (!items.length) return [];
  const versions = await db
    .select()
    .from(formTemplateVersions)
    .where(inArray(formTemplateVersions.templateId, items.map((i) => i.templateId)))
    .orderBy(desc(formTemplateVersions.version));
  return items
    .map((it) => (versions.find((v) => v.templateId === it.templateId && v.version === it.published) ?? versions.find((v) => v.templateId === it.templateId))?.definition)
    .filter((d): d is FormDefinition => !!d);
}

/** The newest requests of a package, for the preview under the mapping (ids only; loadExport does the rest). */
export async function recentRequestIds(packageTemplateId: string, limit = 5): Promise<string[]> {
  const rows = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(eq(requests.packageTemplateId, packageTemplateId), isNotNull(requests.createdAt)))
    .orderBy(desc(requests.createdAt))
    .limit(limit);
  return rows.map((r) => r.id);
}
