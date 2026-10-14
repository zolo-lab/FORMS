import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { mergedDefinitionForStep, type PackageDoc } from "@/lib/forms/merge";
import { roleView } from "@/lib/forms/role-view";
import type { FormDefinition } from "@/lib/forms/schema";
import type { Workflow } from "@/lib/workflow/types";
import { normalizeOrders } from "@/lib/workflow/validate-workflow";

const { packageTemplates, packageTemplateItems, formTemplates, formTemplateVersions } = schema;

export interface WizardPackage {
  id: string;
  name: string;
  description: string | null;
  /** null = available to every organization */
  organizationId: string | null;
  workflow: Workflow;
  /** The fields the requester fills (merged across the package's forms); no pages when there are none. */
  requesterDefinition: FormDefinition;
  documentTitles: string[];
}

/**
 * Build wizard packages with a fixed number of queries (items, forms, published versions in bulk).
 * It used to run ~5 queries per package one after another; with 86 packages in the dev DB that took
 * over 30 seconds from CI and the request wizard timed out.
 */
async function toWizardPackages(pkgs: (typeof packageTemplates.$inferSelect)[]): Promise<WizardPackage[]> {
  if (pkgs.length === 0) return [];
  const items = await db
    .select()
    .from(packageTemplateItems)
    .where(inArray(packageTemplateItems.packageTemplateId, pkgs.map((p) => p.id)))
    .orderBy(asc(packageTemplateItems.order));
  const templateIds = [...new Set(items.map((i) => i.templateId))];
  const templates = templateIds.length ? await db.select().from(formTemplates).where(inArray(formTemplates.id, templateIds)) : [];
  const versions = templateIds.length ? await db.select().from(formTemplateVersions).where(inArray(formTemplateVersions.templateId, templateIds)) : [];
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const published = new Map<string, (typeof versions)[number]>();
  for (const v of versions) if (templateById.get(v.templateId)?.publishedVersion === v.version) published.set(v.templateId, v);

  return pkgs.map((pkg) => {
    const docs: PackageDoc[] = [];
    for (const it of items.filter((i) => i.packageTemplateId === pkg.id)) {
      const t = templateById.get(it.templateId);
      const v = published.get(it.templateId);
      if (t && v) docs.push({ title: t.title, definition: v.definition });
    }
    const merged = docs.length ? mergedDefinitionForStep(docs, "requester") : { schemaVersion: 1 as const, title: pkg.name, pages: [], settings: { layout: "single" as const } };
    const requesterDefinition = roleView(merged, {}, "requester").definition;
    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      organizationId: pkg.organizationId,
      workflow: pkg.workflow,
      requesterDefinition: { ...requesterDefinition, settings: { ...requesterDefinition.settings, layout: "single" } },
      documentTitles: docs.map((d) => d.title),
    };
  });
}

/** Active packages with the form the requester must fill, built from each form's published version. */
export async function listPackagesForWizard(): Promise<WizardPackage[]> {
  const pkgs = await db.select().from(packageTemplates).where(isNull(packageTemplates.archivedAt)).orderBy(asc(packageTemplates.name));
  return toWizardPackages(pkgs);
}

/** One active package in the same shape, or null (unknown or archived). */
export async function getWizardPackage(id: string): Promise<WizardPackage | null> {
  const [pkg] = await db.select().from(packageTemplates).where(and(eq(packageTemplates.id, id), isNull(packageTemplates.archivedAt)));
  return pkg ? ((await toWizardPackages([pkg]))[0] ?? null) : null;
}

// ───────────────────────── Admin: manage packages ─────────────────────────

export async function listPackageSummaries(includeArchived = false) {
  const pkgs = await db
    .select()
    .from(packageTemplates)
    .where(includeArchived ? undefined : isNull(packageTemplates.archivedAt))
    .orderBy(asc(packageTemplates.name));
  const items = pkgs.length ? await db.select().from(packageTemplateItems).where(inArray(packageTemplateItems.packageTemplateId, pkgs.map((p) => p.id))) : [];
  return pkgs.map((p) => ({ ...p, documentCount: items.filter((i) => i.packageTemplateId === p.id).length }));
}

export async function getPackage(id: string) {
  const [pkg] = await db.select().from(packageTemplates).where(eq(packageTemplates.id, id));
  if (!pkg) return null;
  const rows = await db
    .select({ id: packageTemplateItems.id, order: packageTemplateItems.order, required: packageTemplateItems.required, templateId: formTemplates.id, title: formTemplates.title, publishedVersion: formTemplates.publishedVersion })
    .from(packageTemplateItems)
    .innerJoin(formTemplates, eq(formTemplates.id, packageTemplateItems.templateId))
    .where(eq(packageTemplateItems.packageTemplateId, id))
    .orderBy(asc(packageTemplateItems.order));
  return { pkg, items: rows };
}

export async function createPackage(name: string): Promise<string> {
  const [row] = await db
    .insert(packageTemplates)
    .values({ name, workflow: { steps: [{ order: 1, role: "requester", action: "fill" }, { order: 2, role: "employee", action: "fill_and_sign" }] } })
    .returning({ id: packageTemplates.id });
  return row!.id;
}

export async function updatePackage(id: string, patch: { name: string; description: string | null; organizationId: string | null }) {
  await db.update(packageTemplates).set(patch).where(eq(packageTemplates.id, id));
}

export async function setArchived(id: string, archived: boolean) {
  await db.update(packageTemplates).set({ archivedAt: archived ? new Date() : null }).where(eq(packageTemplates.id, id));
}

export async function setWorkflow(id: string, workflow: Workflow) {
  await db.update(packageTemplates).set({ workflow: { steps: normalizeOrders(workflow.steps) } }).where(eq(packageTemplates.id, id));
}

export async function addDocument(packageId: string, templateId: string) {
  const existing = await db.select().from(packageTemplateItems).where(eq(packageTemplateItems.packageTemplateId, packageId));
  if (existing.some((i) => i.templateId === templateId)) return;
  const next = existing.reduce((m, i) => Math.max(m, i.order), 0) + 1;
  await db.insert(packageTemplateItems).values({ packageTemplateId: packageId, templateId, order: next });
}

export async function removeDocument(packageId: string, itemId: string) {
  await db.delete(packageTemplateItems).where(and(eq(packageTemplateItems.id, itemId), eq(packageTemplateItems.packageTemplateId, packageId)));
  await renumber(packageId);
}

export async function setDocumentRequired(packageId: string, itemId: string, required: boolean) {
  await db.update(packageTemplateItems).set({ required }).where(and(eq(packageTemplateItems.id, itemId), eq(packageTemplateItems.packageTemplateId, packageId)));
}

export async function moveDocument(packageId: string, itemId: string, dir: -1 | 1) {
  const items = await db.select().from(packageTemplateItems).where(eq(packageTemplateItems.packageTemplateId, packageId)).orderBy(asc(packageTemplateItems.order));
  const i = items.findIndex((x) => x.id === itemId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return;
  const [a, b] = [items[i]!, items[j]!];
  // (package, template) is unique but `order` is not, so a plain swap is safe.
  await db.update(packageTemplateItems).set({ order: b.order }).where(eq(packageTemplateItems.id, a.id));
  await db.update(packageTemplateItems).set({ order: a.order }).where(eq(packageTemplateItems.id, b.id));
  await renumber(packageId);
}

async function renumber(packageId: string) {
  const items = await db.select().from(packageTemplateItems).where(eq(packageTemplateItems.packageTemplateId, packageId)).orderBy(asc(packageTemplateItems.order), asc(packageTemplateItems.createdAt));
  for (const [i, it] of items.entries()) if (it.order !== i + 1) await db.update(packageTemplateItems).set({ order: i + 1 }).where(eq(packageTemplateItems.id, it.id));
}

/** Forms that can be added to a package: not archived. */
export async function availableForms() {
  return db.select({ id: formTemplates.id, title: formTemplates.title, publishedVersion: formTemplates.publishedVersion }).from(formTemplates).where(isNull(formTemplates.archivedAt)).orderBy(asc(formTemplates.title));
}
