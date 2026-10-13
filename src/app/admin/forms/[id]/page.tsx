import { notFound } from "next/navigation";
import { FormEditor } from "@/components/builder/FormEditor";
import { getEditorData, getPdfFile } from "@/server/forms-store";

export const dynamic = "force-dynamic";

export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getEditorData(id);
  if (!data) notFound();
  const pdf = await getPdfFile(data.version.pdfFileId);
  return (
    <FormEditor
      templateId={id}
      initial={data.version.definition}
      initialVersion={data.version.version}
      initiallyPublished={!!data.version.publishedAt}
      initialPdf={pdf ? { file: { id: pdf.id, name: pdf.name, url: pdf.blobUrl, pages: pdf.pages }, mapping: data.version.pdfMapping ?? { schemaVersion: 1, pages: pdf.pages, stamps: [] } } : null}
    />
  );
}
