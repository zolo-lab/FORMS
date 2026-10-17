/**
 * Matching form fields to the labels printed on a PDF.
 * Local matcher (no network): normalised Hebrew text, aliases per field type, bigram similarity.
 * Optional: a language model picks the pairs from lists of names only; it never produces coordinates
 * (model-made boxes are approximate, geometry comes from the PDF itself).
 */
import { STANDARD_FIELD_IDS } from "@/lib/forms/standard-ids";
import type { FormField } from "@/lib/forms/schema";

export interface MatchLabel { id: string; text: string }
export interface Match { fieldId: string; labelId: string; score: number }

/** Lower-case, no niqqud/punctuation, final letters made regular: "ת.ז." = "תז", "דוא\"ל" = "דואל". */
export function normalizeText(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, "")
    .replace(/ך/g, "כ").replace(/ם/g, "מ").replace(/ן/g, "נ").replace(/ף/g, "פ").replace(/ץ/g, "צ")
    .toLowerCase()
    .replace(/[^א-תa-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const bigrams = (s: string): string[] => {
  const t = s.replace(/\s/g, "");
  return t.length < 2 ? [t] : Array.from({ length: t.length - 1 }, (_, i) => t.slice(i, i + 2));
};

/** 0..1. Equal = 1; one contains the other = 0.85+; otherwise Dice on letter pairs. */
export function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length >= 2 && long.includes(short)) return 0.85 + 0.15 * (short.length / long.length);
  const ba = bigrams(na);
  const bb = bigrams(nb);
  const pool = [...bb];
  let hit = 0;
  for (const g of ba) {
    const i = pool.indexOf(g);
    if (i >= 0) { hit++; pool.splice(i, 1); }
  }
  return (2 * hit) / (ba.length + bb.length);
}

/** Visual-order Hebrew (some PDFs store lines reversed) reads right when the whole string is reversed. */
const reversed = (s: string) => [...s].reverse().join("");

const TYPE_ALIASES: Record<string, string[]> = {
  id_number: ["תעודת זהות", "מספר זהות", "מס זהות", "תז", "ת.ז"],
  date: ["תאריך"],
  signature: ["חתימה", "חתימת"],
  phone: ["טלפון", "נייד", "טלפון נייד"],
  email: ["מייל", "דואל", "אימייל", "כתובת דואל"],
};

/** Names a field may be printed as: its own label, then words typical for its type and standard id. */
export function aliasesFor(field: Pick<FormField, "id" | "type" | "label">): { text: string; weight: number }[] {
  const out = [{ text: field.label, weight: 1 }];
  const std = STANDARD_FIELD_IDS.find((s) => s.id === field.id)?.label;
  if (std) out.push({ text: std, weight: 0.97 });
  for (const a of TYPE_ALIASES[field.type] ?? []) out.push({ text: a, weight: 0.92 });
  return out;
}

export function scoreFieldLabel(field: Pick<FormField, "id" | "type" | "label">, labelText: string): number {
  let best = 0;
  for (const a of aliasesFor(field)) {
    const s = Math.max(similarity(a.text, labelText), similarity(a.text, reversed(labelText)));
    best = Math.max(best, s * a.weight);
  }
  return best;
}

/** Greedy one-to-one matching, best scores first; pairs under `min` are left out (the field stays unplaced). */
export function matchLocal(fields: Pick<FormField, "id" | "type" | "label">[], labels: MatchLabel[], min = 0.6): Match[] {
  const pairs: Match[] = [];
  for (const f of fields) for (const l of labels) {
    const score = scoreFieldLabel(f, l.text);
    if (score >= min) pairs.push({ fieldId: f.id, labelId: l.id, score });
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedF = new Set<string>();
  const usedL = new Set<string>();
  const out: Match[] = [];
  for (const p of pairs) {
    if (usedF.has(p.fieldId) || usedL.has(p.labelId)) continue;
    usedF.add(p.fieldId);
    usedL.add(p.labelId);
    out.push(p);
  }
  return out;
}

// ───────────── Language-model matcher (names only) ─────────────

export const MATCH_TOOL = {
  name: "report_matches",
  description: "Report which printed label on the PDF belongs to which form field.",
  input_schema: {
    type: "object",
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fieldId: { type: "string" },
            labelId: { type: "string" },
            confidence: { type: "number", description: "0 to 1" },
          },
          required: ["fieldId", "labelId", "confidence"],
        },
      },
    },
    required: ["matches"],
  },
} as const;

export function matchPrompt(fields: Pick<FormField, "id" | "type" | "label">[], labels: MatchLabel[]): string {
  return [
    "A Hebrew form has the fields listed under FIELDS. A PDF of the same form has printed labels listed under LABELS (text only, in reading order).",
    "For each field, find the label printed next to the place where the answer is written. Match only when you are fairly sure; leave a field out when no label fits.",
    "A label may be used for at most one field and the other way round. Labels may be stored in visual order (reversed); read them as Hebrew.",
    "Answer only by calling report_matches. Use the ids exactly as given.",
    "",
    "FIELDS:",
    ...fields.map((f) => `- ${f.id} | ${f.type} | ${f.label}`),
    "",
    "LABELS:",
    ...labels.map((l) => `- ${l.id} | ${l.text}`),
  ].join("\n");
}

/** Keep only well-formed, known, one-to-one pairs with confidence of at least 0.5. */
export function sanitizeMatches(raw: unknown, fields: { id: string }[], labels: { id: string }[]): Match[] {
  const list = Array.isArray((raw as { matches?: unknown })?.matches) ? ((raw as { matches: unknown[] }).matches) : [];
  const fieldIds = new Set(fields.map((f) => f.id));
  const labelIds = new Set(labels.map((l) => l.id));
  const usedF = new Set<string>();
  const usedL = new Set<string>();
  const out: Match[] = [];
  for (const m of list as Record<string, unknown>[]) {
    const fieldId = typeof m?.fieldId === "string" ? m.fieldId : "";
    const labelId = typeof m?.labelId === "string" ? m.labelId : "";
    const score = typeof m?.confidence === "number" ? m.confidence : 0;
    if (!fieldIds.has(fieldId) || !labelIds.has(labelId) || score < 0.5) continue;
    if (usedF.has(fieldId) || usedL.has(labelId)) continue;
    usedF.add(fieldId);
    usedL.add(labelId);
    out.push({ fieldId, labelId, score: Math.min(1, score) });
  }
  return out;
}
