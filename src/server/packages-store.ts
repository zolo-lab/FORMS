import { asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { mergedDefinitionForStep, type PackageDoc } from "@/lib/forms/merge";
import { roleView } from "@/lib/forms/role-view";
import type { FormDefinition } from "@/lib/forms/schema";
import type { Workflow } from "@/lib/workflow/types";

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

/** Active packages with the form the requester must fill, built from each form's published version. */
export async function listPackagesForWizard(): Promise<WizardPackage[]> {
  const pkgs = await db.select().from(packageTemplates).where(isNull(packageTemplates.archivedAt)).orderBy(asc(packageTemplates.name));
  const out: WizardPackage[] = [];
  for (const pkg of pkgs) {
    const items = await db.select().from(packageTemplateItems).where(eq(packageTemplateItems.packageTemplateId, pkg.id)).orderBy(asc(packageTemplateItems.order));
    const docs: PackageDoc[] = [];
    for (const it of items) {
      const [t] = await db.select().from(formTemplates).where(eq(formTemplates.id, it.templateId));
      if (!t?.publishedVersion) continue;
      const versions = await db.select().from(formTemplateVersions).where(eq(formTemplateVersions.templateId, it.templateId));
      const v = versions.find((x) => x.version === t.publishedVersion);
      if (v) docs.push({ title: t.title, definition: v.definition });
    }
    const merged = docs.length ? mergedDefinitionForStep(docs, "requester") : { schemaVersion: 1 as const, title: pkg.name, pages: [], settings: { layout: "single" as const } };
    const requesterDefinition = roleView(merged, {}, "requester").definition;
    out.push({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      organizationId: pkg.organizationId,
      workflow: pkg.workflow,
      requesterDefinition: { ...requesterDefinition, settings: { ...requesterDefinition.settings, layout: "single" } },
      documentTitles: docs.map((d) => d.title),
    });
  }
  return out;
}
