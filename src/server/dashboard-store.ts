/** Read-side queries for the requests dashboard (list with filters, KPI strip). */
import { and, asc, desc, eq, exists, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { PAGE_SIZE, daysSince, median, progress, type RequestFilters } from "@/lib/requests/list";
import type { visibilityScope } from "@/lib/auth/permissions";

/** `null` = everything (admin / no sign-in); otherwise what `visibilityScope` allows. */
export type Scope = ReturnType<typeof visibilityScope>;

const { requests, signingSteps, organizations, packageTemplates } = schema;

const IN_PROGRESS = ["in_progress", "returned"] as const;
const OPEN_STEP = ["active", "in_progress"] as const;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Overdue: the open step's due date passed (set from the route's `dueHours`) or the request's own deadline did. */
export function overdueCondition(now: Date): SQL {
  return and(inArray(requests.status, [...IN_PROGRESS]), or(lt(requests.dueAt, now), lt(requests.expiresAt, now)))!;
}

/** Requests a non-admin sees: ones they created, packages they may view fully, and requests with a step addressed to them. */
export function scopeCondition(scope: Scope): SQL | undefined {
  if (!scope) return undefined;
  const parts: SQL[] = [
    eq(requests.createdBy, scope.userId),
    exists(
      db
        .select({ one: sql`1` })
        .from(signingSteps)
        .where(and(eq(signingSteps.requestId, requests.id), sql`lower(${signingSteps.assigneeEmail}) = ${scope.email}`)),
    ),
  ];
  if (scope.viewAllPackageIds.length) parts.push(inArray(requests.packageTemplateId, scope.viewAllPackageIds));
  return or(...parts)!;
}

export function conditions(f: RequestFilters, now: Date, scope: Scope = null): SQL[] {
  const c: SQL[] = [];
  const sc = scopeCondition(scope);
  if (sc) c.push(sc);
  if (f.org) c.push(eq(requests.organizationId, f.org));
  if (f.pkg) c.push(eq(requests.packageTemplateId, f.pkg));
  if (f.status) c.push(eq(requests.status, f.status));
  // Dates are Israel calendar days.
  if (f.from) c.push(sql`${requests.createdAt} >= (${f.from}::date)::timestamp AT TIME ZONE 'Asia/Jerusalem'`);
  if (f.to) c.push(sql`${requests.createdAt} < ((${f.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Jerusalem')`);
  if (f.overdue) c.push(overdueCondition(now));
  if (f.role) {
    c.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(signingSteps)
          .where(and(eq(signingSteps.requestId, requests.id), eq(signingSteps.role, f.role), inArray(signingSteps.status, [...OPEN_STEP]))),
      ),
    );
  }
  if (f.assigneeEmail) {
    c.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(signingSteps)
          .where(and(eq(signingSteps.requestId, requests.id), sql`lower(${signingSteps.assigneeEmail}) = ${f.assigneeEmail.toLowerCase()}`, inArray(signingSteps.status, [...OPEN_STEP]))),
      ),
    );
  }
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    c.push(or(ilike(requests.subjectName, like), ilike(requests.subjectIdNumber, like), ilike(requests.subjectEmail, like))!);
  }
  return c;
}

export interface RequestRow {
  id: string;
  subjectName: string;
  status: (typeof requests.$inferSelect)["status"];
  createdAt: Date;
  expiresAt: Date | null;
  dueAt: Date | null;
  organizationName: string;
  packageName: string;
  waitingFor: { role: string; name: string }[];
  daysInStep: number | null;
  progress: { done: number; total: number };
  overdue: boolean;
}

export async function queryRequests(f: RequestFilters, now = new Date(), pageSize = PAGE_SIZE, scope: Scope = null): Promise<{ rows: RequestRow[]; total: number; pageCount: number }> {
  const where = and(...conditions(f, now, scope));
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(requests).where(where);
  const pageCount = Math.max(1, Math.ceil(n / pageSize));
  const page = Math.min(f.page, pageCount);
  const base = await db
    .select({
      id: requests.id,
      subjectName: requests.subjectName,
      status: requests.status,
      createdAt: requests.createdAt,
      expiresAt: requests.expiresAt,
      dueAt: requests.dueAt,
      organizationName: organizations.name,
      packageName: packageTemplates.name,
    })
    .from(requests)
    .innerJoin(organizations, eq(requests.organizationId, organizations.id))
    .innerJoin(packageTemplates, eq(requests.packageTemplateId, packageTemplates.id))
    .where(where)
    .orderBy(desc(requests.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const ids = base.map((r) => r.id);
  const steps = ids.length
    ? await db
        .select({ requestId: signingSteps.requestId, role: signingSteps.role, status: signingSteps.status, assigneeName: signingSteps.assigneeName, activatedAt: signingSteps.activatedAt })
        .from(signingSteps)
        .where(inArray(signingSteps.requestId, ids))
        .orderBy(asc(signingSteps.order))
    : [];

  const rows = base.map<RequestRow>((r) => {
    const mine = steps.filter((s) => s.requestId === r.id);
    const open = mine.filter((s) => (OPEN_STEP as readonly string[]).includes(s.status));
    const since = open.map((s) => s.activatedAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
    return {
      ...r,
      waitingFor: open.map((s) => ({ role: s.role, name: s.assigneeName ?? "" })),
      daysInStep: since ? daysSince(since, now) : null,
      progress: progress(mine),
      overdue: (IN_PROGRESS as readonly string[]).includes(r.status) && ((!!r.dueAt && r.dueAt < now) || (!!r.expiresAt && r.expiresAt < now)),
    };
  });
  return { rows, total: n, pageCount };
}

export interface Kpis {
  active: number;
  waitingByRole: { role: string; count: number }[];
  overdue: number;
  completed30: number;
  medianDaysToComplete: number | null;
}

export async function requestKpis(orgId?: string, now = new Date(), scope: Scope = null): Promise<Kpis> {
  const org = and(orgId ? eq(requests.organizationId, orgId) : undefined, scopeCondition(scope));
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [[active], [overdue], waiting, completed] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(requests).where(and(org, inArray(requests.status, [...IN_PROGRESS]))),
    db.select({ n: sql<number>`count(*)::int` }).from(requests).where(and(org, overdueCondition(now))),
    db
      .select({ role: signingSteps.role, count: sql<number>`count(*)::int` })
      .from(signingSteps)
      .innerJoin(requests, eq(signingSteps.requestId, requests.id))
      .where(and(org, inArray(requests.status, [...IN_PROGRESS]), inArray(signingSteps.status, [...OPEN_STEP])))
      .groupBy(signingSteps.role),
    db
      .select({ createdAt: requests.createdAt, completedAt: requests.completedAt })
      .from(requests)
      .where(and(org, eq(requests.status, "completed"), gte(requests.completedAt, since)))
      .limit(5000),
  ]);
  const durations = completed.filter((c) => c.completedAt).map((c) => (c.completedAt!.getTime() - c.createdAt.getTime()) / 86_400_000);
  const med = median(durations);
  return {
    active: active?.n ?? 0,
    waitingByRole: waiting.sort((a, b) => b.count - a.count),
    overdue: overdue?.n ?? 0,
    completed30: completed.length,
    medianDaysToComplete: med === null ? null : Math.round(med * 10) / 10,
  };
}

export async function listPackages() {
  return db.select({ id: packageTemplates.id, name: packageTemplates.name }).from(packageTemplates).orderBy(asc(packageTemplates.name));
}

/** Label → text of every answer collected so far, across the request's (pinned) documents. */
export async function requestAnswerItems(requestId: string): Promise<{ label: string; text: string }[]> {
  const { collectedAnswers } = await import("./requests-store");
  const { summaryItems } = await import("@/lib/pdf/summary");
  const answers = await collectedAnswers(requestId);
  const docs = await db
    .select({ definition: schema.formTemplateVersions.definition })
    .from(schema.packageDocuments)
    .innerJoin(schema.formTemplateVersions, eq(schema.packageDocuments.templateVersionId, schema.formTemplateVersions.id))
    .where(eq(schema.packageDocuments.requestId, requestId))
    .orderBy(asc(schema.packageDocuments.order));
  const seen = new Set<string>();
  const out: { label: string; text: string }[] = [];
  for (const d of docs) {
    for (const it of summaryItems(d.definition, answers)) {
      const key = `${it.label}|${it.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

/** Files the signers uploaded (answers whose value is a list of `{ url, name }` pointing into our file store). */
export async function uploadedFiles(requestId: string): Promise<{ name: string; url: string }[]> {
  const { collectedAnswers } = await import("./requests-store");
  const answers = await collectedAnswers(requestId);
  const out: { name: string; url: string }[] = [];
  for (const v of Object.values(answers)) {
    if (!Array.isArray(v)) continue;
    for (const f of v) {
      const o = f as { name?: unknown; url?: unknown };
      if (o && typeof o.url === "string" && o.url.startsWith("/api/admin/files/") && typeof o.name === "string") out.push({ name: o.name, url: o.url });
    }
  }
  return out;
}
