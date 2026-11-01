import { notFound } from "next/navigation";
import { getPdfFile, getPublishedVersion } from "@/server/forms-store";
import { FormPreview } from "./form-preview";
import { formPackageId, getPackage } from "@/server/packages-store";
import { listContacts, listGroups } from "@/server/people-store";
import { emailFieldsOf, namedStep, stepViews } from "@/lib/workflow/step-fields";

export const dynamic = "force-dynamic";

/**
 * Full-screen view of a form as its first step fills it, like the real link (admin only: /preview is behind the session
 * guard). Nothing is saved. `?steps=1` adds the switch to see any other step.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ all?: string; steps?: string }> }) {
  const { id } = await params;
  const { all, steps: bySteps } = await searchParams;
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
      <FormPreview
        definition={version.definition}
        pdf={pdf}
        steps={steps}
        showSteps={bySteps === "1" || all === "1"}
        startWithAll={all === "1"}
      />
    </main>
  );
}
