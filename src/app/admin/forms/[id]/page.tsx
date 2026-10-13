import { notFound } from "next/navigation";
import { FormEditor } from "@/components/builder/FormEditor";
import { getEditorData } from "@/server/forms-store";

export const dynamic = "force-dynamic";

export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getEditorData(id);
  if (!data) notFound();
  return (
    <FormEditor
      templateId={id}
      initial={data.version.definition}
      initialVersion={data.version.version}
      initiallyPublished={!!data.version.publishedAt}
    />
  );
}
