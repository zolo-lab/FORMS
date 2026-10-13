import { notFound } from "next/navigation";
import { getEditorData } from "@/server/forms-store";
import { TemplatePreview } from "./template-preview";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getEditorData(id);
  if (!data) notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="mb-4 rounded-md bg-muted p-2 text-xs text-muted-foreground">תצוגה מקדימה של גרסה {data.version.version}. המילוי לא נשמר.</p>
      <TemplatePreview definition={data.version.definition} />
    </main>
  );
}
