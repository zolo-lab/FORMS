import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/db";
import { blankForm, publishIssues } from "@/lib/forms/builder";
import { parseFormDefinition, type FormDefinition } from "@/lib/forms/schema";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import { formPackageId, syncFormPackage } from "./packages-store";

const { formTemplates, formTemplateVersions, pdfFiles, packageDocuments, packageTemplateItems, requests, webhooks } = schema;

export async function listTemplates() {
  return db.select().from(formTemplates).orderBy(desc(formTemplates.updatedAt));
}

export async function createTemplate(
  title: string,
  definition?: FormDefinition,
  kind: "web" | "pdf" | "both" = "pdf",
  pdf?: { pdfFileId: string; pdfMapping: PdfMapping },
): Promise<string> {
  const def = definition ?? blankForm(title);
  const [t] = await db
    .insert(formTemplates)
    .values({ slug: `form-${nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "x")}`, title, kind })
    .returning({ id: formTemplates.id });
  await db.insert(formTemplateVersions).values({ templateId: t!.id, version: 1, definition: { ...def, title }, ...(pdf ?? {}) });
  // The form's signing route and sending settings live with it from the start.
  await formPackageId(t!.id, title);
  return t!.id;
}

/** The newest version (draft if one exists, otherwise the published one). */
export async function getEditorData(templateId: string) {
  const [template] = await db.select().from(formTemplates).where(eq(formTemplates.id, templateId));
  if (!template) return null;
  const [version] = await db
    .select()
    .from(formTemplateVersions)
    .where(eq(formTemplateVersions.templateId, templateId))
    .orderBy(desc(formTemplateVersions.version))
    .limit(1);
  return { template, version: version! };
}

export async function getPublishedVersion(templateId: string) {
  const [v] = await db
    .select()
    .from(formTemplateVersions)
    .where(and(eq(formTemplateVersions.templateId, templateId)))
    .orderBy(desc(formTemplateVersions.version));
  return v ?? null;
}

/**
 * Saves into the newest version if it is still a draft; if it is published, creates the next
 * version as a draft (published versions are immutable). Returns the version number saved to.
 */
export async function saveDraft(
  templateId: string,
  definition: unknown,
  pdf?: { pdfFileId: string | null; pdfMapping: PdfMapping | null },
): Promise<{ version: number } | { error: string }> {
  const parsed = parseFormDefinition(definition);
  if (!parsed.success) return { error: "הגדרת הטופס אינה תקינה" };
  const data = await getEditorData(templateId);
  if (!data) return { error: "הטופס לא נמצא" };
  const { version } = data;
  const extra = pdf ? { pdfFileId: pdf.pdfFileId, pdfMapping: pdf.pdfMapping } : {};
  if (version.publishedAt) {
    await db.insert(formTemplateVersions).values({
      templateId,
      version: version.version + 1,
      definition: parsed.data,
      pdfFileId: pdf ? pdf.pdfFileId : version.pdfFileId,
      pdfMapping: pdf ? pdf.pdfMapping : version.pdfMapping,
    });
    await db.update(formTemplates).set({ title: parsed.data.title }).where(eq(formTemplates.id, templateId));
    if (parsed.data.title !== data.template.title) await syncFormPackage(templateId, { name: parsed.data.title });
    return { version: version.version + 1 };
  }
  await db.update(formTemplateVersions).set({ definition: parsed.data, ...extra }).where(eq(formTemplateVersions.id, version.id));
  await db.update(formTemplates).set({ title: parsed.data.title }).where(eq(formTemplates.id, templateId));
  if (parsed.data.title !== data.template.title) await syncFormPackage(templateId, { name: parsed.data.title });
  return { version: version.version };
}

export const NEEDS_PDF = "העלו PDF לפני הפרסום: כל טופס חדש מתחיל ממסמך";

export async function publishTemplate(templateId: string): Promise<{ ok: true; version: number } | { ok: false; issues: string[] }> {
  const data = await getEditorData(templateId);
  if (!data) return { ok: false, issues: ["הטופס לא נמצא"] };
  if (data.version.publishedAt) return { ok: false, issues: ["אין טיוטה חדשה לפרסום"] };
  const issues = publishIssues(data.version.definition).map((i) => i.message);
  // Every new form starts from a PDF; forms published before that rule keep working without one.
  if (!data.version.pdfFileId && data.template.publishedVersion === null) issues.unshift(NEEDS_PDF);
  if (issues.length) return { ok: false, issues };
  await db.update(formTemplateVersions).set({ publishedAt: new Date() }).where(eq(formTemplateVersions.id, data.version.id));
  await db
    .update(formTemplates)
    .set({ status: "active", publishedVersion: data.version.version, title: data.version.definition.title })
    .where(eq(formTemplates.id, templateId));
  return { ok: true, version: data.version.version };
}

export async function duplicateTemplate(templateId: string): Promise<string | null> {
  const data = await getEditorData(templateId);
  if (!data) return null;
  const title = `${data.template.title} (עותק)`;
  // The copy keeps the document and where the fields sit on it (a form is its PDF plus its fields).
  const pdf = data.version.pdfFileId && data.version.pdfMapping ? { pdfFileId: data.version.pdfFileId, pdfMapping: data.version.pdfMapping } : undefined;
  return createTemplate(title, data.version.definition, "pdf", pdf);
}

export async function setArchived(templateId: string, archived: boolean) {
  const data = await getEditorData(templateId);
  if (!data) return;
  await db
    .update(formTemplates)
    .set({ status: archived ? "archived" : data.template.publishedVersion ? "active" : "draft" })
    .where(eq(formTemplates.id, templateId));
  await syncFormPackage(templateId, { archived });
}

export async function getPdfFile(id: string | null) {
  if (!id) return null;
  const [row] = await db.select().from(pdfFiles).where(eq(pdfFiles.id, id));
  return row ?? null;
}

/** Requests that used any version of each form (a request is counted once per form). */
export async function requestCountsByTemplate(): Promise<Map<string, number>> {
  const rows = await db
    .selectDistinct({ templateId: formTemplateVersions.templateId, requestId: packageDocuments.requestId })
    .from(packageDocuments)
    .innerJoin(formTemplateVersions, eq(packageDocuments.templateVersionId, formTemplateVersions.id));
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.templateId, (out.get(r.templateId) ?? 0) + 1);
  return out;
}

/**
 * Deletes a form for good: its versions, the requests that used it (with their steps, signatures and history),
 * its place in packages, its webhooks, and its PDFs that no other form uses. Writes are sequential (neon-http);
 * the request rows go first so nothing is left pointing at a deleted version.
 */
export async function deleteTemplate(templateId: string): Promise<{ requests: number }> {
  const versions = await db
    .select({ id: formTemplateVersions.id, pdfFileId: formTemplateVersions.pdfFileId })
    .from(formTemplateVersions)
    .where(eq(formTemplateVersions.templateId, templateId));
  const versionIds = versions.map((v) => v.id);
  let requestIds: string[] = [];
  if (versionIds.length) {
    const docs = await db
      .selectDistinct({ requestId: packageDocuments.requestId })
      .from(packageDocuments)
      .where(inArray(packageDocuments.templateVersionId, versionIds));
    requestIds = docs.map((d) => d.requestId);
  }
  if (requestIds.length) await db.delete(requests).where(inArray(requests.id, requestIds));
  // The form's own signing route and settings go with it (its requests were deleted above).
  const ownPkg = await formPackageId(templateId);
  const [used] = await db.select({ id: requests.id }).from(requests).where(eq(requests.packageTemplateId, ownPkg)).limit(1);
  if (!used) await db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, ownPkg));
  await db.delete(packageTemplateItems).where(eq(packageTemplateItems.templateId, templateId));
  await db.delete(webhooks).where(eq(webhooks.templateId, templateId));
  await db.delete(formTemplates).where(eq(formTemplates.id, templateId));
  const pdfIds = [...new Set(versions.map((v) => v.pdfFileId).filter((id): id is string => !!id))];
  if (pdfIds.length) {
    const stillUsed = await db
      .selectDistinct({ id: formTemplateVersions.pdfFileId })
      .from(formTemplateVersions)
      .where(inArray(formTemplateVersions.pdfFileId, pdfIds));
    const used = new Set(stillUsed.map((r) => r.id));
    const orphans = pdfIds.filter((id) => !used.has(id));
    if (orphans.length) await db.delete(pdfFiles).where(inArray(pdfFiles.id, orphans));
  }
  return { requests: requestIds.length };
}

/**
 * "חיבור טפסים" (iForms kit): a new form made of `templateIds` in this order. Its document is their PDFs one after
 * the other, its fields are all of theirs, and it gets its own signing route (set it on "שלבי הטופס").
 */
export async function combineTemplates(templateIds: string[], title: string): Promise<{ id: string } | { error: string }> {
  const { combineForms } = await import("@/lib/forms/combine");
  const { getFile, putFile, sha256Hex } = await import("./storage");
  const { PDFDocument } = await import("pdf-lib");
  if (templateIds.length < 2) return { error: "בחרו לפחות שני טפסים" };
  const out = await PDFDocument.create();
  const parts = [];
  for (const id of templateIds) {
    const data = await getEditorData(id);
    if (!data) return { error: "אחד הטפסים לא נמצא" };
    const pdf = await getPdfFile(data.version.pdfFileId);
    const stored = pdf ? await getFile(pdf.blobUrl.split("/").pop()!) : null;
    if (!pdf || !stored) return { error: `לטופס "${data.template.title}" אין מסמך PDF` };
    const src = await PDFDocument.load(stored.bytes);
    for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
    parts.push({ definition: data.version.definition, stamps: data.version.pdfMapping?.stamps ?? [], pages: pdf.pages });
  }
  const combined = combineForms(title, parts);
  const bytes = await out.save();
  const stored = await putFile({ name: `${title}.pdf`, mime: "application/pdf", bytes });
  const [file] = await db
    .insert(pdfFiles)
    .values({ name: `${title}.pdf`, blobUrl: stored.url, sha256: sha256Hex(bytes), pageCount: combined.pages.length, pages: combined.pages })
    .returning({ id: pdfFiles.id });
  const id = await createTemplate(title, combined.definition, "pdf", { pdfFileId: file!.id, pdfMapping: { schemaVersion: 1, pages: combined.pages, stamps: combined.stamps } });
  return { id };
}
