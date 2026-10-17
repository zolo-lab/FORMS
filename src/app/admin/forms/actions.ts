"use server";
import { requireGrant } from "@/server/guards";
import { redirect } from "next/navigation";
import { createTemplate, duplicateTemplate, getPdfFile, publishTemplate, saveDraft, setArchived } from "@/server/forms-store";
import { parseFormDefinition } from "@/lib/forms/schema";
import { pdfMappingSchema } from "@/lib/forms/pdf-mapping";
import { findTemplate } from "@/lib/forms/templates";

/** A new form always starts from a PDF that was just uploaded (`/api/admin/pdf`): the form opens on the PDF tab, where its fields are proposed. */
export async function createFormFromPdfAction(title: string, pdfFileId: string) {
  await requireGrant("manageForms");
  const pdf = await getPdfFile(pdfFileId);
  if (!pdf) return { error: "קובץ ה-PDF לא נמצא, נסו להעלות שוב" };
  const name = title.trim() || pdf.name.replace(/\.pdf$/i, "") || "טופס חדש";
  const id = await createTemplate(name, undefined, "pdf", { pdfFileId: pdf.id, pdfMapping: { schemaVersion: 1, pages: pdf.pages, stamps: [] } });
  return { id };
}

/** A form that starts from one of the built-in templates (docs/builder-plan.md §2.1). */
export async function createFromTemplateAction(formData: FormData) {
  await requireGrant("manageForms");
  const t = findTemplate(String(formData.get("template") ?? ""));
  if (!t) redirect("/admin/forms?error=template");
  const title = String(formData.get("title") ?? "").trim() || t.definition.title;
  const id = await createTemplate(title, { ...t.definition, title });
  redirect(`/admin/forms/${id}?tab=pdf`);
}

export async function importFormAction(formData: FormData) {
  await requireGrant("manageForms");
  const raw = String(formData.get("json") ?? "");
  let parsed;
  try {
    parsed = parseFormDefinition(JSON.parse(raw));
  } catch {
    return redirect("/admin/forms?error=json");
  }
  if (!parsed.success) return redirect("/admin/forms?error=schema");
  const id = await createTemplate(parsed.data.title, parsed.data);
  redirect(`/admin/forms/${id}`);
}

export async function duplicateFormAction(formData: FormData) {
  await requireGrant("manageForms");
  const id = await duplicateTemplate(String(formData.get("id")));
  redirect(id ? `/admin/forms/${id}` : "/admin/forms");
}

export async function archiveFormAction(formData: FormData) {
  await requireGrant("manageForms");
  await setArchived(String(formData.get("id")), formData.get("archive") === "1");
  redirect("/admin/forms");
}

export async function saveDraftAction(templateId: string, definition: unknown, pdf?: { pdfFileId: string | null; pdfMapping: unknown }) {
  await requireGrant("manageForms");
  let pdfArg;
  if (pdf) {
    const mapping = pdf.pdfMapping === null ? null : pdfMappingSchema.safeParse(pdf.pdfMapping);
    if (mapping && "success" in mapping && !mapping.success) return { error: "מיפוי ה-PDF אינו תקין" };
    pdfArg = { pdfFileId: pdf.pdfFileId, pdfMapping: mapping && "success" in mapping ? mapping.data : null };
  }
  return saveDraft(templateId, definition, pdfArg);
}

export async function publishAction(templateId: string) {
  await requireGrant("manageForms");
  return publishTemplate(templateId);
}
