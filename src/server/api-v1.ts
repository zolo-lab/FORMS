/** Service layer of the public REST API (/api/v1). Every call is scoped to the organization of the API key. */
import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { bearerKey, hashApiKey } from "@/lib/api/keys";
import { parseCreateBody } from "@/lib/api/create-request";
import { REQUEST_STATUSES } from "@/lib/workflow/types";
import { allFields } from "@/lib/forms/schema";
import { validateAnswers } from "@/lib/forms/validate";
import { getWizardPackage, listPackagesForWizard } from "./packages-store";
import { cancelRequest, collectedAnswers, createRequest, getRequest, sendRequest } from "./requests-store";
import { tempFileUrl } from "./webhooks";

const { apiKeys, requests } = schema;

export interface ApiAuth {
  organizationId: string;
  keyId: string;
}

/** Resolves `Authorization: Bearer fk_…` to an organization, or null. */
export async function authenticate(header: string | null): Promise<ApiAuth | null> {
  const key = bearerKey(header);
  if (!key) return null;
  const [row] = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, hashApiKey(key)), isNull(apiKeys.revokedAt)));
  if (!row) return null;
  // Best effort, not worth failing the request for.
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => {});
  return { organizationId: row.organizationId, keyId: row.id };
}

export async function listApiTemplates(orgId: string) {
  const all = await listPackagesForWizard();
  return all
    .filter((p) => !p.organizationId || p.organizationId === orgId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      documents: p.documentTitles,
      steps: p.workflow.steps.map((s) => ({ order: s.order, role: s.role, action: s.action })),
      /** The answers the caller must (or may) send in `answers`. */
      requesterFields: allFields(p.requesterDefinition)
        .filter((f) => f.type !== "heading" && f.type !== "info_text" && f.type !== "image" && f.type !== "divider")
        .map((f) => ({ id: f.id, label: f.label, type: f.type, required: !!f.required })),
    }));
}

export interface ListQuery {
  from?: string;
  to?: string;
  status?: string;
  limit?: number;
  before?: string;
}

export async function listApiRequests(orgId: string, q: ListQuery) {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const conds = [eq(requests.organizationId, orgId)];
  if (q.status && (REQUEST_STATUSES as readonly string[]).includes(q.status)) conds.push(eq(requests.status, q.status as (typeof REQUEST_STATUSES)[number]));
  if (q.from && !Number.isNaN(Date.parse(q.from))) conds.push(gte(requests.createdAt, new Date(q.from)));
  if (q.to && !Number.isNaN(Date.parse(q.to))) conds.push(lt(requests.createdAt, new Date(q.to)));
  if (q.before && !Number.isNaN(Date.parse(q.before))) conds.push(lt(requests.createdAt, new Date(q.before)));
  const rows = await db
    .select({
      id: requests.id,
      status: requests.status,
      subjectName: requests.subjectName,
      packageTemplateId: requests.packageTemplateId,
      createdAt: requests.createdAt,
      completedAt: requests.completedAt,
      expiresAt: requests.expiresAt,
    })
    .from(requests)
    .where(and(...conds))
    .orderBy(desc(requests.createdAt))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return { requests: page, nextBefore: rows.length > limit ? page[page.length - 1]!.createdAt.toISOString() : null };
}

export async function getApiRequest(orgId: string, id: string) {
  const data = await getRequest(id);
  if (!data || data.request.organizationId !== orgId) return null;
  const { request, steps, documents } = data;
  return {
    id: request.id,
    status: request.status,
    kind: request.kind,
    subject: { name: request.subjectName, idNumber: request.subjectIdNumber, email: request.subjectEmail, phone: request.subjectPhone },
    createdAt: request.createdAt,
    completedAt: request.completedAt,
    expiresAt: request.expiresAt,
    cancelReason: request.cancelReason,
    steps: steps.map((s) => ({ id: s.id, order: s.order, role: s.role, status: s.status, assigneeName: s.assigneeName, completedAt: s.completedAt })),
    documents: documents.map((d) => ({ id: d.id, title: d.title, status: d.status, sha256: d.finalSha256, pdfUrl: d.finalFileId ? tempFileUrl(d.id) : null })),
    answers: request.status === "completed" ? await collectedAnswers(request.id) : undefined,
  };
}

export type ApiCreateResult =
  | { ok: true; status: 201; body: { id: string; status: string; links: { stepId: string; role: string; url: string }[] } }
  | { ok: false; status: 400 | 404 | 422; errors: Record<string, string> };

export async function createApiRequest(orgId: string, raw: unknown): Promise<ApiCreateResult> {
  const parsed = parseCreateBody(raw);
  if (!parsed.ok) return { ok: false, status: 400, errors: parsed.errors };
  const b = parsed.value;

  const pkg = await getWizardPackage(b.packageTemplateId);
  if (!pkg || (pkg.organizationId && pkg.organizationId !== orgId)) return { ok: false, status: 404, errors: { packageTemplateId: "not found" } };

  const v = validateAnswers(pkg.requesterDefinition, b.answers);
  if (!v.ok) return { ok: false, status: 422, errors: Object.fromEntries(Object.entries(v.errors).map(([k, m]) => [`answers.${k}`, m])) };

  const id = await createRequest({
    packageTemplateId: pkg.id,
    organizationId: orgId,
    subject: b.subject,
    requesterAnswers: v.cleaned,
    expiresAt: b.expiresAt,
    extra: { redirectUrl: b.redirectUrl, custom: b.apiParams },
  });
  await db.insert(schema.events).values({ requestId: id, actorType: "api", type: "request_created_via_api", payload: {} });
  if (!b.send) return { ok: true, status: 201, body: { id, status: "draft", links: [] } };

  const sent = await sendRequest(id, { type: "api" });
  const { appUrl } = await import("./requests-store");
  const full = await getRequest(id);
  const links = sent.tokens.map((t) => {
    const step = full?.steps.find((s) => s.id === t.stepId);
    return { stepId: t.stepId, role: step?.role ?? "", url: `${appUrl()}/s/${t.token}` };
  });
  return { ok: true, status: 201, body: { id, status: sent.status, links } };
}

export async function cancelApiRequest(orgId: string, id: string): Promise<"ok" | "not_found" | "conflict"> {
  const [row] = await db.select({ organizationId: requests.organizationId }).from(requests).where(eq(requests.id, id));
  if (!row || row.organizationId !== orgId) return "not_found";
  try {
    await cancelRequest(id, "בוטל דרך ה-API", { type: "api" });
    return "ok";
  } catch {
    return "conflict";
  }
}

