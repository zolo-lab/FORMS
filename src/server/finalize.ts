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

  let generated = 0;
  let skipped = 0;
  for (const d of docs) {
    if (d.finalFileId && !opts.force) {
      skipped++;
      continue;
    }
    const [version] = await db.select().from(formTemplateVersions).where(eq(formTemplateVersions.id, d.templateVersionId));
    if (!version) continue;
    const [template] = await db.select().from(formTemplates).where(eq(formTemplates.id, version.templateId));
    const title = template?.title ?? version.definition.title;

    let base: Uint8Array;
    const [pdf] = version.pdfFileId ? await db.select().from(pdfFiles).where(eq(pdfFiles.id, version.pdfFileId)) : [];
    const stored = pdf && version.pdfMapping ? await getFile(pdf.blobUrl.split("/").pop()!) : null;
    if (stored && version.pdfMapping) {
      base = await stampPdf(stored.bytes, version.pdfMapping, version.definition, answers);
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
  }
  return { generated, skipped };
}
