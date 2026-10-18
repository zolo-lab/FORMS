/**
 * Learning from corrections: every time an admin confirms the "fields found in the PDF" dialog, each proposal is
 * recorded with what became of it. The next detection looks up the same label (normalized) and applies the latest
 * decision: dropped again, or the name / type / id that was chosen. People's choices win over the model's. Pure.
 */
import type { DetectedField } from "./detect";
import { normalizeText } from "./match";
import { REFINABLE_TYPES } from "./refine";
import type { FieldType } from "@/lib/forms/field-types";

const TEXT = new Set<string>(REFINABLE_TYPES);
const KEY = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** The latest decision about one label. */
export interface Learned { skip?: boolean; label?: string; type?: FieldType; key?: string }

/** One proposal and what the admin did with it (what is posted after the dialog). */
export interface Feedback {
  sourceLabel: string;
  detectedType: string;
  kept: boolean;
  finalLabel?: string;
  finalType?: string;
  finalKey?: string;
}

export const learnKey = (label: string) => normalizeText(label);

/** What the dialog's result says about each proposal: dropped, or kept with the admin's edits. */
export function feedbackFrom(proposed: Pick<DetectedField, "id" | "label" | "type" | "key">[], kept: Pick<DetectedField, "id" | "label" | "type" | "key">[]): Feedback[] {
  const byId = new Map(kept.map((k) => [k.id, k]));
  return proposed
    .filter((p) => learnKey(p.label))
    .map((p) => {
      const k = byId.get(p.id);
      return k
        ? { sourceLabel: p.label, detectedType: p.type, kept: true, finalLabel: k.label, finalType: k.type, ...(k.key ? { finalKey: k.key } : {}) }
        : { sourceLabel: p.label, detectedType: p.type, kept: false };
    });
}

/** Rows (newest first) → the latest decision per label. A decision that changed nothing is still a decision (kept). */
export function latestDecisions(rows: (Feedback & { sourceNorm: string })[]): Map<string, Learned> {
  const out = new Map<string, Learned>();
  for (const r of rows) {
    if (out.has(r.sourceNorm)) continue;
    if (!r.kept) { out.set(r.sourceNorm, { skip: true }); continue; }
    const l: Learned = {};
    if (r.finalLabel && r.finalLabel !== r.sourceLabel) l.label = r.finalLabel;
    if (r.finalType && r.finalType !== r.detectedType && TEXT.has(r.finalType)) l.type = r.finalType as FieldType;
    if (r.finalKey && KEY.test(r.finalKey)) l.key = r.finalKey;
    out.set(r.sourceNorm, l);
  }
  return out;
}

/**
 * Apply what was learned. A dropped label comes back unticked (`skip`); a kept one gets its name, id and — between
 * plain text types only — its type. Marks each touched proposal `learned` so the dialog can say so.
 */
export function applyLearned<T extends DetectedField>(fields: T[], learned: Record<string, Learned>): T[] {
  return fields.map((f) => {
    const l = learned[learnKey(f.label)];
    if (!l) return f;
    if (l.skip) return { ...f, learned: true, skip: true };
    return {
      ...f,
      learned: true,
      ...(l.label ? { label: l.label } : {}),
      ...(l.type && TEXT.has(f.type) ? { type: l.type } : {}),
      ...(l.key ? { key: l.key } : {}),
    };
  });
}

/** Recent corrections as examples for the model: only the ones where a person changed something. */
export function examplesFor(rows: Feedback[], max = 30): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (out.length >= max) break;
    if (!r.kept) out.push(`"${r.sourceLabel}" (${r.detectedType}) → not a field`);
    else if ((r.finalLabel && r.finalLabel !== r.sourceLabel) || (r.finalType && r.finalType !== r.detectedType)) {
      out.push(`"${r.sourceLabel}" (${r.detectedType}) → "${r.finalLabel ?? r.sourceLabel}" (${r.finalType ?? r.detectedType})`);
    }
  }
  return out;
}
