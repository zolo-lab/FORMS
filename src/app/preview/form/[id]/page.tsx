import { notFound } from "next/navigation";
import { getPdfFile, getPublishedVersion } from "@/server/forms-store";
import { FormPreview } from "./form-preview";

export const dynamic = "force-dynamic";

/** Full-screen view of a form's latest saved version (admin only: /preview is behind the session guard). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const version = /^[0-9a-f-]{36}$/i.test(id) ? await getPublishedVersion(id) : null;
  if (!version) notFound();
  const file = version.pdfMapping ? await getPdfFile(version.pdfFileId) : null;
  const pdf = file && version.pdfMapping ? { fileId: file.id, url: file.blobUrl, mapping: version.pdfMapping } : undefined;
  return (
    <main className={pdf ? "mx-auto max-w-5xl px-4 py-8" : "mx-auto max-w-3xl px-4 py-8"}>
      <p className="mb-4 rounded-md bg-muted p-2 text-xs text-muted-foreground">
        תצוגה של {version.publishedAt ? `גרסה ${version.version} (פורסמה)` : `גרסה ${version.version} (טיוטה)`}. המילוי כאן לא נשמר.
      </p>
      <FormPreview
        definition={version.definition}
        pdf={pdf}
      />
    </main>
  );
}
