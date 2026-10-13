/** Loads requests (by filter or by ids) for CSV/XLSX export and the signed-PDF ZIP. */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ExportRequest } from "@/lib/export/rows";
import type { RequestFilters } from "@/lib/requests/list";
import { REQUEST_STATUS_LABEL } from "@/lib/workflow/labels";
import type { Answers } from "@/lib/forms/conditions";
import { conditions } from "./dashboard-store";
import { getFile } from "./storage";

const { requests, organizations, packageTemplates, packageDocuments, formTemplateVersions, formTemplates, submissions } = schema;

export const EXPORT_LIMIT = 5000;

async function requestIds(sel: { ids?: string[]; filters?: RequestFilters }): Promise<string[]> {
  if (sel.ids) return sel.ids.slice(0, EXPORT_LIMIT);
  const rows = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(...conditions(sel.filters ?? { page: 1 }, new Date())))
    .orderBy(desc(requests.createdAt))
    .limit(EXPORT_LIMIT);
  return rows.map((r) => r.id);
}

export async function loadExport(sel: { ids?: string[]; filters?: RequestFilters }): Promise<ExportRequest[]> {
  const ids = await requestIds(sel);
  if (ids.length === 0) return [];
  const [reqs, docs, subs] = await Promise.all([
    db
      .select({ r: requests, org: organizations.name, pkg: packageTemplates.name })
      .from(requests)
      .innerJoin(organizations, eq(requests.organizationId, organizations.id))
      .innerJoin(packageTemplates, eq(requests.packageTemplateId, packageTemplates.id))
      .where(inArray(requests.id, ids)),
    db
      .select({ requestId: packageDocuments.requestId, order: packageDocuments.order, definition: formTemplateVersions.definition })
      .from(packageDocuments)
      .innerJoin(formTemplateVersions, eq(packageDocuments.templateVersionId, formTemplateVersions.id))
      .where(inArray(packageDocuments.requestId, ids))
      .orderBy(asc(packageDocuments.order)),
    db.select({ requestId: submissions.requestId, answers: submissions.answers }).from(submissions).where(inArray(submissions.requestId, ids)),
  ]);
  const byId = new Map(reqs.map((x) => [x.r.id, x]));
  return ids
    .map((id) => byId.get(id))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map(({ r, org, pkg }) => {
      const answers: Answers = { ...((r.apiParams as { requesterAnswers?: Answers } | null)?.requesterAnswers ?? {}) };
      for (const s of subs) if (s.requestId === r.id) Object.assign(answers, s.answers);
      return {
        id: r.id,
        subjectName: r.subjectName,
        subjectIdNumber: r.subjectIdNumber ?? "",
        organization: org,
        package: pkg,
        status: REQUEST_STATUS_LABEL[r.status][0],
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        answers,
        definitions: docs.filter((d) => d.requestId === r.id).map((d) => d.definition),
      };
    });
}

/** Final signed PDFs of the selected requests, as ZIP entries `<subject> - <document>.pdf`. */
export async function loadFinalPdfs(sel: { ids?: string[]; filters?: RequestFilters }): Promise<{ name: string; data: Uint8Array }[]> {
  const ids = await requestIds(sel);
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      subject: requests.subjectName,
      fileId: packageDocuments.finalFileId,
      title: formTemplates.title,
    })
    .from(packageDocuments)
    .innerJoin(requests, eq(packageDocuments.requestId, requests.id))
    .innerJoin(formTemplateVersions, eq(packageDocuments.templateVersionId, formTemplateVersions.id))
    .innerJoin(formTemplates, eq(formTemplateVersions.templateId, formTemplates.id))
    .where(inArray(packageDocuments.requestId, ids))
    .orderBy(asc(requests.subjectName), asc(packageDocuments.order));
  const used = new Set<string>();
  const out: { name: string; data: Uint8Array }[] = [];
  for (const r of rows) {
    if (!r.fileId) continue;
    const file = await getFile(r.fileId);
    if (!file) continue;
    const base = `${r.subject} - ${r.title}`.replace(/[\\/:*?"<>|]+/g, "_");
    let name = `${base}.pdf`;
    for (let n = 2; used.has(name); n++) name = `${base} (${n}).pdf`;
    used.add(name);
    out.push({ name, data: file.bytes });
  }
  return out;
}
