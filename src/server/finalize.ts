/**
 * Final PDFs: when a request completes, every package document becomes one PDF
 * (stamped template, or an answers summary when the form has no PDF) plus the reference page.
 * Idempotent per document: a document that already has `finalFileId` is left alone unless `force`.
 */
import { asc, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db, schema } from "@/db";
import { stampPdf } from "@/lib/forms/pdf-mapping";
import { appendCertificate } from "@/lib/pdf/certificate";
import { summaryItems, summaryPdf } from "@/lib/pdf/summary";
import { archivePdf, driveEnabled } from "./drive";
import { collectedAnswers } from "./requests-store";
import { getFile, putFile, sha256Hex } from "./storage";

const { requests, packageDocuments, formTemplateVersions, formTemplates, signingSteps, organizations, pdfFiles } = schema;

export async function finalizeRequest(requestId: string, opts: { force?: boolean } = {}): Promise<{ generated: number; skipped: number }> {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!req) throw new Error("request not found");
  if (req.status !== "completed") throw new Error(`request is ${req.status}, not completed`);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, req.organizationId));
  const steps = await db.select().from(signingSteps).where(eq(signingSteps.requestId, requestId)).orderBy(asc(signingSteps.order), asc(signingSteps.createdAt));
  const docs = await db.select().from(packageDocuments).where(eq(packageDocuments.requestId, requestId)).orderBy(asc(packageDocuments.order));
  const answers = await collectedAnswers(requestId);
  const times = steps.map((s) => s.completedAt?.getTime() ?? 0).filter((t) => t > 0);
  const signedAt = times.length ? new Date(Math.max(...times)) : new Date();

  let generated = 0;
  let skipped = 0;
  for (const d of docs) {
    const [version] = await db.select().from(formTemplateVersions).where(eq(formTemplateVersions.id, d.templateVersionId));
    if (!version) continue;
    const [template] = await db.select().from(formTemplates).where(eq(formTemplates.id, version.templateId));
    const title = template?.title ?? version.definition.title;

    if (d.finalFileId && !opts.force) {
      skipped++;
      // Already generated: only file the existing PDF in Drive when that has not happened yet (backfill / retry).
      if (!d.driveFileId && driveEnabled()) {
        try {
          const existing = await getFile(d.finalFileId);
          const archived = existing && (await archivePdf({ organization: org?.name ?? "", formTitle: title, subject: req.subjectName, requestId, signedAt, bytes: existing.bytes }));
          if (archived) await db.update(packageDocuments).set(archived).where(eq(packageDocuments.id, d.id));
        } catch (err) {
          console.error("drive archive failed", { requestId, doc: d.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      continue;
    }

    let base: Uint8Array;
    const [pdf] = version.pdfFileId ? await db.select().from(pdfFiles).where(eq(pdfFiles.id, version.pdfFileId)) : [];
    const stored = pdf && version.pdfMapping ? await getFile(pdf.blobUrl.split("/").pop()!) : null;
    // A form built on a PDF must never silently turn into the plain summary: fail so it is retried/fixed.
    if (version.pdfFileId && version.pdfMapping && !stored) throw new Error(`PDF template file missing for "${title}" (file ${version.pdfFileId})`);
    if (stored && version.pdfMapping) {
      base = await stampPdf(stored.bytes, version.pdfMapping, version.definition, answers, { signedAt });
    } else {
      base = await (await summaryPdf(title, summaryItems(version.definition, answers))).save();
    }

    const doc = await PDFDocument.load(base);
    await appendCertificate(doc, {
      requestId,
      organization: org?.name ?? "",
      subject: req.subjectName,
      documentTitle: title,
      documentSha256: sha256Hex(base),
      generatedAt: new Date(),
      steps: steps
        .filter((s) => s.status === "completed")
        .map((s) => ({ role: s.role, name: s.assigneeName ?? "", status: s.status, completedAt: s.completedAt, ip: s.signerIp })),
    });
    const bytes = await doc.save();
    const file = await putFile({ name: `${title}.pdf`, mime: "application/pdf", bytes });
    await db.update(packageDocuments).set({ finalFileId: file.id, finalSha256: file.sha256, generatedAt: new Date(), status: "completed" }).where(eq(packageDocuments.id, d.id));
    generated++;

    // Archive copy in Drive. Never blocks or fails the signing flow: the stored file above is the source of truth,
    // and a failed or unconfigured archive is simply retried the next time the request is finalized with `force`.
    try {
      const archived = await archivePdf({ organization: org?.name ?? "", formTitle: title, subject: req.subjectName, requestId, signedAt, bytes });
      if (archived) await db.update(packageDocuments).set(archived).where(eq(packageDocuments.id, d.id));
    } catch (err) {
      console.error("drive archive failed", { requestId, doc: d.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { generated, skipped };
}
