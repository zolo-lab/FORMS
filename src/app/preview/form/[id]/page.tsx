import { notFound } from "next/navigation";
import { getPdfFile, getPublishedVersion } from "@/server/forms-store";
import { FormPreview } from "./form-preview";
import { formPackageId, getPackage } from "@/server/packages-store";
import { listContacts, listGroups } from "@/server/people-store";
import { emailFieldsOf, namedStep, stepViews } from "@/lib/workflow/step-fields";

export const dynamic = "force-dynamic";

/** Full-screen view of a form's latest saved version (admin only: /preview is behind the session guard). */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ all?: string }> }) {
  const { id } = await params;
  const { all } = await searchParams;
  const version = /^[0-9a-f-]{36}$/i.test(id) ? await getPublishedVersion(id) : null;
  if (!version) notFound();
  const file = version.pdfMapping ? await getPdfFile(version.pdfFileId) : null;
  const pdf = file && version.pdfMapping ? { fileId: file.id, url: file.blobUrl, mapping: version.pdfMapping } : undefined;
  // Each step sees only its own fields: the preview opens as step 1 (the sender) and can switch to any step.
  const [pkg, contacts, groups] = await Promise.all([getPackage(await formPackageId(id)), listContacts(), listGroups()]);
  const steps = stepViews((pkg?.pkg.workflow.steps ?? []).map(namedStep), {
    contacts: contacts.map((c) => ({ id: c.id, label: c.name })),
    groups: groups.map((g) => ({ id: g.id, label: g.name })),
    fields: emailFieldsOf(version.definition),
  });
  return (
    <main className={pdf ? "mx-auto max-w-5xl px-4 py-8" : "mx-auto max-w-3xl px-4 py-8"}>
      <p className="mb-4 rounded-md bg-muted p-2 text-xs text-muted-foreground">
        תצוגה של {version.publishedAt ? `גרסה ${version.version} (פורסמה)` : `גרסה ${version.version} (טיוטה)`}. המילוי כאן לא נשמר.
      </p>
      <FormPreview
        definition={version.definition}
        pdf={pdf}
        steps={steps}
        startWithAll={all === "1"}
      />
    </main>
  );
}
