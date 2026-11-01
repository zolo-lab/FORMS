import { formLinkOrgs } from "@/server/public-fill";
import { listOrgs } from "@/server/orgs-store";
import { notFound } from "next/navigation";
import { FormEditor } from "@/components/builder/FormEditor";
import { FlowSettings, type FlowQuery } from "@/components/packages/FlowSettings";
import { saveStepsAction } from "@/app/admin/packages/actions";
import { assignRoles, draftOf, stepFromDraft } from "@/lib/workflow/step-who";
import { getEditorData, getPdfFile } from "@/server/forms-store";
import { listContacts, listGroups } from "@/server/people-store";
import { formPackageId, getPackage, setWorkflow } from "@/server/packages-store";

export const dynamic = "force-dynamic";

export default async function EditFormPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlowQuery & { tab?: string }> }) {
  const { id } = await params;
  const { tab, ...query } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getEditorData(id);
  if (!data) notFound();
  const pkgId = await formPackageId(id, data.template.title);
  const [pdf, groups, contacts, pkg, orgs] = await Promise.all([getPdfFile(data.version.pdfFileId), listGroups(), listContacts(), getPackage(pkgId), listOrgs()]);

  // Every step that goes to a person has its own role, so every step can be picked for a field ("שלב 2", "שלב 3"…).
  // Older forms had steps sharing a role: give them their own once, here.
  const stored = pkg?.pkg.workflow.steps ?? [];
  // Step 1 is always the sender: a workflow without one gets it in front.
  const loaded = stored.map(draftOf);
  const drafts = assignRoles(loaded[0]?.who === "requester" ? loaded : [{ who: "requester" as const, role: "requester" as const }, ...loaded.filter((d) => d.who !== "requester")]);
  if (drafts.length !== stored.length || drafts.some((d, i) => d.role !== stored[i]!.role)) await setWorkflow(pkgId, { steps: drafts.map((d, i) => stepFromDraft(d, i)) });

  const sendSettings = await FlowSettings({ id: pkgId, query, formId: id, settingsOnly: true });
  const initialTab = tab === "pdf" || tab === "steps" ? tab : "edit";
  return (
    <FormEditor
      templateId={id}
      linkOrgs={(await formLinkOrgs([id])).get(id) ?? []}
      initialTab={initialTab}
      needsPdf={!data.version.pdfFileId && data.template.publishedVersion === null}
      groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      flow={{
        packageId: pkgId,
        drafts,
        contacts: contacts.map((c) => ({ id: c.id, label: c.email ? `${c.name} · ${c.email}` : c.name })),
        groups: groups.map((g) => ({ id: g.id, label: `${g.name} (${g.memberIds.length})` })),
        orgs: orgs.filter((o) => o.active).map((o) => ({ id: o.id, label: o.name })),
        save: saveStepsAction,
        sendSettings,
        sendSettingsOpen: !!(query.saved === "settings" || query.saved === "org" || query.settingsError || query.error),
      }}
      initial={data.version.definition}
      initialVersion={data.version.version}
      initiallyPublished={!!data.version.publishedAt}
      initialPdf={pdf ? { file: { id: pdf.id, name: pdf.name, url: pdf.blobUrl, pages: pdf.pages }, mapping: data.version.pdfMapping ?? { schemaVersion: 1, pages: pdf.pages, stamps: [] } } : null}
    />
  );
}
