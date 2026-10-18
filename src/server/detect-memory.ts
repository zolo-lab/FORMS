/**
 * Stores what admins did with proposed fields and reads back the latest decision per label (src/lib/pdf/learn.ts).
 * Failures never block the dialog: no memory just means the plain detection.
 */
import { desc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { examplesFor, latestDecisions, learnKey, type Feedback, type Learned } from "@/lib/pdf/learn";

const { detectFeedback } = schema;

export async function recordFeedback(items: Feedback[], meta: { templateId?: string | null; userId?: string | null } = {}): Promise<number> {
  const rows = items
    .filter((i) => learnKey(i.sourceLabel))
    .slice(0, 300)
    .map((i) => ({
      sourceLabel: i.sourceLabel.slice(0, 300),
      sourceNorm: learnKey(i.sourceLabel).slice(0, 300),
      detectedType: i.detectedType.slice(0, 40),
      kept: i.kept,
      finalLabel: i.finalLabel?.slice(0, 300) ?? null,
      finalType: i.finalType?.slice(0, 40) ?? null,
      finalKey: i.finalKey?.slice(0, 80) ?? null,
      templateId: meta.templateId ?? null,
      createdBy: meta.userId ?? null,
    }));
  if (rows.length) await db.insert(detectFeedback).values(rows);
  return rows.length;
}

/** The latest decision for each of these labels. */
export async function learnedFor(labels: string[]): Promise<Record<string, Learned>> {
  const norms = [...new Set(labels.map(learnKey).filter(Boolean))].slice(0, 400);
  if (!norms.length) return {};
  try {
    const rows = await db.select().from(detectFeedback).where(inArray(detectFeedback.sourceNorm, norms)).orderBy(desc(detectFeedback.createdAt));
    return Object.fromEntries(latestDecisions(rows.map(toFeedback)));
  } catch {
    return {};
  }
}

/** Recent corrections, as examples for the model. */
export async function recentExamples(max = 30): Promise<string[]> {
  try {
    const rows = await db.select().from(detectFeedback).orderBy(desc(detectFeedback.createdAt)).limit(300);
    return examplesFor(rows.map(toFeedback), max);
  } catch {
    return [];
  }
}

function toFeedback(r: typeof detectFeedback.$inferSelect): Feedback & { sourceNorm: string } {
  return {
    sourceLabel: r.sourceLabel,
    sourceNorm: r.sourceNorm,
    detectedType: r.detectedType,
    kept: r.kept,
    ...(r.finalLabel ? { finalLabel: r.finalLabel } : {}),
    ...(r.finalType ? { finalType: r.finalType } : {}),
    ...(r.finalKey ? { finalKey: r.finalKey } : {}),
  };
}
