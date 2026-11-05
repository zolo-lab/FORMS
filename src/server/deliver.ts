/**
 * The engine behind "עיבוד טופס": once a request is finished and its documents (and parts) exist, every
 * destination the form defines is carried out and recorded in `deliveries`.
 *
 * Two rules it keeps:
 *  - A destination that fails never fails the request. The signed documents are already stored; a delivery is
 *    a copy going somewhere, and it is recorded as failed with "נסה שוב" instead of throwing.
 *  - Idempotent **within a round**. A request that was returned, fixed and completed again is a new round, so
 *    the corrected documents really do go out instead of being skipped as already sent.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeProcessing } from "@/lib/processing/model";
import { describeTarget, filesForDestination, recipientsFor, skipReason, type PeopleLookup, type RequestFiles, type SendableFile } from "@/lib/processing/deliver";
import type { Destination } from "@/lib/processing/types";
import type { Answers } from "@/lib/forms/conditions";
import type { Recipient } from "@/lib/requests/recipients";
import { ownDocuments, partsOf } from "./package-docs";
import { triggersFor } from "./mail-triggers";
import { driveProblem, uploadToFolders } from "./drive";
import { resolveFileName, resolvePath, type PathContext } from "@/lib/processing/path";
import { insertNotifications } from "./notifications";

const { deliveries, events, packageDocuments, packageTemplates, formTemplateVersions, formTemplates, requests, signingSteps, organizations, users } = schema;

/** Which completion this is: a request that came back and finished again gets a round of its own. */
export async function currentRound(requestId: string): Promise<number> {
  const rows = await db.select({ type: events.type }).from(events).where(eq(events.requestId, requestId));
  return Math.max(1, rows.filter((e) => e.type === "request_completed").length);
}

/** Files a signer uploaded, kept with the field they were uploaded in. */
function uploadsByField(answers: Answers): { fieldId: string; fileId: string; name: string }[] {
  const out: { fieldId: string; fileId: string; name: string }[] = [];
  for (const [fieldId, v] of Object.entries(answers)) {
    const walk = (x: unknown) => {
      if (Array.isArray(x)) return x.forEach(walk);
      if (!x || typeof x !== "object") return;
      const o = x as Record<string, unknown>;
      const id = typeof o.url === "string" ? /\/files\/([0-9a-f-]{36})$/.exec(o.url)?.[1] : undefined;
      if (id && typeof o.name === "string") out.push({ fieldId, fileId: id, name: o.name });
      else Object.values(o).forEach(walk);
    };
    walk(v);
  }
  return out;
}

/** Everything of this request a destination may pick from. */
async function requestFiles(requestId: string, answers: Answers): Promise<RequestFiles> {
  const docs = await db
    .select({ documentId: packageDocuments.id, fileId: packageDocuments.finalFileId, templateId: formTemplateVersions.templateId, title: formTemplates.title })
    .from(packageDocuments)
    .innerJoin(formTemplateVersions, eq(formTemplateVersions.id, packageDocuments.templateVersionId))
    .innerJoin(formTemplates, eq(formTemplates.id, formTemplateVersions.templateId))
    .where(ownDocuments(requestId))
    .orderBy(asc(packageDocuments.order));
  const parts = await db
    .select({ documentId: packageDocuments.id, partName: packageDocuments.partName, fileId: packageDocuments.finalFileId, pages: packageDocuments.pages })
    .from(packageDocuments)
    .where(partsOf(requestId))
    .orderBy(asc(packageDocuments.order));
  return {
    documents: docs.map((d) => ({ documentId: d.documentId, templateId: d.templateId, fileId: d.fileId, title: d.title })),
    // Parts are matched back to `processing.parts` by name: that is what the builder shows and what the row stores.
    parts: parts.map((p) => ({ documentId: p.documentId, partId: p.partName ?? "", fileId: p.fileId, name: p.partName ?? "חלק" })),
    uploads: uploadsByField(answers),
  };
}

/** Who every kind of recipient reference stands for, for this request. */
async function peopleFor(requestId: string, answers: Answers): Promise<PeopleLookup> {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!req) return { byRole: {}, byStep: {}, byField: {}, byUser: {} };
  const steps = await db.select().from(signingSteps).where(eq(signingSteps.requestId, requestId)).orderBy(asc(signingSteps.order));
  const mail = await triggersFor(req.organizationId);
  const [creator] = req.createdBy ? await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, req.createdBy)) : [];
  const everyone = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);

  const byStep: Record<string, Recipient | undefined> = {};
  for (const s of steps) {
    if (s.assigneeEmail) byStep[s.role] ??= { name: s.assigneeName ?? s.assigneeEmail, email: s.assigneeEmail };
  }
  const byField: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(answers)) if (typeof v === "string" && v.includes("@")) byField[k] = v;

  return {
    byRole: {
      employee: req.subjectEmail ? [{ name: req.subjectName, email: req.subjectEmail }] : [],
      creator: creator?.email ? [{ name: creator.name ?? creator.email, email: creator.email }] : [],
      secretariat: mail.secretariat,
      bookkeeping: mail.bookkeeping,
      managers: [],
    },
    byStep,
    byField,
    byUser: Object.fromEntries(everyone.filter((u) => u.email).map((u) => [u.id, { name: u.name ?? u.email!, email: u.email! }])),
  };
}

async function record(row: typeof deliveries.$inferInsert): Promise<void> {
  await db.insert(deliveries).values(row);
}

/** Sends one destination. Never throws: the outcome is the row it returns. */
async function runDestination(
  d: Destination,
  opts: { requestId: string; organizationId: string; round: number; files: RequestFiles; look: PeopleLookup; subject: string; formName: string; path: PathContext; driveRootFolderId: string | null },
): Promise<void> {
  const picked = filesForDestination(d, opts.files);
  const to = d.kind === "email" ? recipientsFor(d.to, opts.look) : [];
  const target = describeTarget(d, to);
  const base = { requestId: opts.requestId, destinationId: d.id, kind: d.kind, target, round: opts.round, documentIds: picked.map((f) => f.documentId).filter((x): x is string => !!x) };

  const skip = skipReason(d, picked, to);
  if (skip) {
    await record({ ...base, status: "failed", error: skip, attempts: 1 });
    return;
  }

  try {
    let url: string | null = null;
    if (d.kind === "email") await mailDestination(d, picked, to, opts);
    else if (d.kind === "drive") url = await driveDestination(d, picked, opts);
    // Webhook destinations arrive with their own step of the build; until then they are recorded as not
    // attempted rather than silently dropped.
    else {
      await record({ ...base, status: "failed", error: "יעד מסוג זה עדיין לא נתמך", attempts: 1 });
      return;
    }
    await record({ ...base, status: "done", attempts: 1, url });
    await db.insert(events).values({ requestId: opts.requestId, actorType: "system", type: "delivery_done", payload: { destinationId: d.id, kind: d.kind, target, files: picked.length } });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await record({ ...base, status: "failed", error: error.slice(0, 400), attempts: 1 });
    await db.insert(events).values({ requestId: opts.requestId, actorType: "system", type: "delivery_failed", payload: { destinationId: d.id, kind: d.kind, target, error: error.slice(0, 200) } });
    console.error("delivery failed", { requestId: opts.requestId, destination: d.id, error });
  }
}

/**
 * Files every chosen file into Drive, under the destination's path (or a folder picked in the browser).
 * Returns the link of the last file, which is what the request page shows.
 */
async function driveDestination(
  d: Destination & { kind: "drive" },
  picked: SendableFile[],
  opts: { requestId: string; path: PathContext; driveRootFolderId: string | null },
): Promise<string | null> {
  const problem = driveProblem();
  if (problem) throw new Error(`ארכיון Drive כבוי: ${problem}`);
  const { getFile } = await import("./storage");
  let last: string | null = null;
  for (const f of picked) {
    const stored = await getFile(f.fileId);
    if (!stored) throw new Error(`הקובץ "${f.name}" לא נמצא`);
    // `{סוג}` follows the part being filed, so one destination can carry several parts into one tree.
    const ctx: PathContext = { ...opts.path, type: opts.path.type ?? f.name.replace(/\.pdf$/i, "") };
    const { segments, unknown } = resolvePath(d.path ?? "", ctx);
    if (unknown.length) throw new Error(`משתנה לא מוכר בנתיב: ${unknown.join(", ")}`);
    const up = await uploadToFolders({
      folders: segments,
      fileName: resolveFileName(d.fileName, ctx),
      bytes: stored.bytes,
      // A folder picked in the browser wins over the path; otherwise the organization's root, then the global one.
      rootFolderId: d.folderId ?? opts.driveRootFolderId,
    });
    if (!up) throw new Error("ארכיון Drive לא מוגדר");
    last = up.driveUrl;
  }
  return last;
}

const PROCESSING_KEY = "processing_docs";

async function mailDestination(
  d: Destination & { kind: "email" },
  picked: SendableFile[],
  to: Recipient[],
  opts: { requestId: string; organizationId: string; subject: string; formName: string },
): Promise<void> {
  const names = picked.map((f) => f.name).join(", ");
  const note = d.note?.trim();
  const body = [
    `שלום,`,
    `מצורפים מסמכים מתוך "${opts.formName}" של ${opts.subject}: ${names}.`,
    ...(note ? [note] : []),
    `הודעה אוטומטית – נא לא להשיב למייל זה.`,
  ].join("\n\n");
  const inserted = await insertNotifications(
    to.map((p) => ({
      organizationId: opts.organizationId,
      requestId: opts.requestId,
      channel: "email" as const,
      to: p.email,
      templateKey: PROCESSING_KEY,
      subject: `${opts.formName} – ${opts.subject}`,
      body,
      // Only the files this destination chose; `attach: false` sends the note without them.
      attachFileIds: d.attach ? picked.map((f) => f.fileId) : [],
    })),
  );
  if (inserted === 0) throw new Error("ההודעה לא נוצרה (ייתכן שהנמענים כיבו את ההתראה הזאת)");
}

/**
 * Carries out every destination of the request's form. Called from `finalizeRequest` once the documents and
 * their parts exist, and from the "נסה שוב" button.
 */
export async function runProcessing(requestId: string, opts: { only?: string[] } = {}): Promise<{ run: number; failed: number }> {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!req) return { run: 0, failed: 0 };
  const [pkg] = await db.select({ processing: packageTemplates.processing, name: packageTemplates.name }).from(packageTemplates).where(eq(packageTemplates.id, req.packageTemplateId));
  const processing = normalizeProcessing(pkg?.processing);
  const wanted = processing.destinations.filter((d) => !opts.only || opts.only.includes(d.id));
  if (!wanted.length) return { run: 0, failed: 0 };

  const round = await currentRound(requestId);
  // Already carried out in this round: a second finalize must not send everything again.
  const done = await db.select({ destinationId: deliveries.destinationId, status: deliveries.status }).from(deliveries).where(and(eq(deliveries.requestId, requestId), eq(deliveries.round, round)));
  const settled = new Set(done.filter((r) => r.status === "done").map((r) => r.destinationId));

  const { collectedAnswers } = await import("./requests-store");
  const answers = await collectedAnswers(requestId);
  const [files, look] = await Promise.all([requestFiles(requestId, answers), peopleFor(requestId, answers)]);
  const [org] = await db.select({ name: organizations.name, driveRootFolderId: organizations.driveRootFolderId }).from(organizations).where(eq(organizations.id, req.organizationId));
  const steps = await db.select({ completedAt: signingSteps.completedAt }).from(signingSteps).where(eq(signingSteps.requestId, requestId));
  const times = steps.map((s) => s.completedAt?.getTime() ?? 0).filter((t) => t > 0);
  const path: PathContext = {
    organization: org?.name,
    form: pkg?.name,
    subject: req.subjectName,
    idNumber: req.subjectIdNumber ?? undefined,
    signedAt: times.length ? new Date(Math.max(...times)) : new Date(),
    requestId,
    answers: answers as Record<string, unknown>,
  };

  let run = 0;
  for (const d of wanted) {
    if (settled.has(d.id) && !opts.only) continue;
    // A retry replaces the earlier attempt of this round rather than piling rows up.
    if (opts.only) await db.delete(deliveries).where(and(eq(deliveries.requestId, requestId), eq(deliveries.destinationId, d.id), eq(deliveries.round, round)));
    await runDestination(d, { requestId, organizationId: req.organizationId, round, files, look, subject: req.subjectName, formName: pkg?.name ?? org?.name ?? "", path, driveRootFolderId: org?.driveRootFolderId ?? null });
    run++;
  }
  const after = await db.select({ status: deliveries.status }).from(deliveries).where(and(eq(deliveries.requestId, requestId), eq(deliveries.round, round)));
  return { run, failed: after.filter((r) => r.status === "failed").length };
}

/** What the request page shows under "עיבוד", newest round first. */
export async function requestDeliveries(requestId: string) {
  return db.select().from(deliveries).where(eq(deliveries.requestId, requestId)).orderBy(asc(deliveries.round), asc(deliveries.createdAt));
}

/** Files a queued processing mail should carry (read at send time, so the mail stays small in the outbox). */
export async function attachmentsOf(fileIds: string[]): Promise<{ id: string }[]> {
  if (!fileIds.length) return [];
  const rows = await db.select({ id: schema.storedFiles.id }).from(schema.storedFiles).where(inArray(schema.storedFiles.id, fileIds));
  return rows;
}
