/**
 * Page ranges as the builder writes them: "1-2,5", "3-" (to the end), "2" (one page). 1-based, inclusive.
 * Pure and unit tested — the engine cuts exactly what this returns, so an off-by-one here is a wrong PDF.
 */

export interface PageRangeResult {
  /** 1-based page numbers, in ascending order, each one once. Empty when the spec is unusable. */
  pages: number[];
  /** What is wrong with the spec, in Hebrew, for the builder. Empty = fine. */
  errors: string[];
  /** Worth saying out loud but not wrong, e.g. pages named twice. */
  warnings: string[];
}

const RANGE = /^(\d+)\s*-\s*(\d+)?$/;

/**
 * `pageCount` is the document's length when it is known (the builder has the PDF open); leave it undefined and
 * the numbers are only checked for being sane, not for fitting a document.
 */
export function parsePages(spec: string, pageCount?: number): PageRangeResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<number>();
  const dupes = new Set<number>();
  const text = (spec ?? "").trim();
  if (!text) return { pages: [], errors: ["לא נבחרו עמודים"], warnings };

  for (const raw of text.split(",")) {
    const piece = raw.trim();
    if (!piece) continue;
    const m = RANGE.exec(piece);
    if (m) {
      const from = Number(m[1]);
      // "3-" means "from 3 to the end": without the document's length there is no end to resolve.
      const to = m[2] === undefined ? pageCount : Number(m[2]);
      if (to === undefined) { errors.push(`"${piece}" – צריך לדעת כמה עמודים יש במסמך כדי לקרוא "עד הסוף"`); continue; }
      if (from < 1) { errors.push(`"${piece}" – עמוד ${from} לא קיים, העמודים מתחילים ב-1`); continue; }
      if (to < from) { errors.push(`"${piece}" – הטווח הפוך`); continue; }
      if (pageCount !== undefined && to > pageCount) { errors.push(`"${piece}" – במסמך יש ${pageCount} עמודים`); continue; }
      for (let p = from; p <= to; p++) (seen.has(p) ? dupes : seen).add(p);
      continue;
    }
    if (!/^\d+$/.test(piece)) { errors.push(`"${piece}" – לא מספר עמוד או טווח`); continue; }
    const p = Number(piece);
    if (p < 1) { errors.push(`"${piece}" – העמודים מתחילים ב-1`); continue; }
    if (pageCount !== undefined && p > pageCount) { errors.push(`"${piece}" – במסמך יש ${pageCount} עמודים`); continue; }
    (seen.has(p) ? dupes : seen).add(p);
  }

  if (dupes.size) warnings.push(`${dupes.size === 1 ? "עמוד מופיע" : `${dupes.size} עמודים מופיעים`} יותר מפעם אחת`);
  const pages = [...seen].sort((a, b) => a - b);
  if (!pages.length && !errors.length) errors.push("לא נבחרו עמודים");
  return { pages, errors, warnings };
}

/** The same numbers written back as a tidy spec: [1,2,3,7] → "1-3,7". */
export function formatPages(pages: number[]): string {
  const sorted = [...new Set(pages)].filter((p) => p >= 1).sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    out.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`);
    i = j + 1;
  }
  return out.join(",");
}

/** Pages of the document that no part takes, so the builder can be told what would be left behind. */
export function uncoveredPages(specs: string[], pageCount: number): number[] {
  const taken = new Set(specs.flatMap((s) => parsePages(s, pageCount).pages));
  const out: number[] = [];
  for (let p = 1; p <= pageCount; p++) if (!taken.has(p)) out.push(p);
  return out;
}

/** Parts that claim the same page, as pairs of their indexes — allowed, but worth showing. */
export function overlappingParts(specs: string[], pageCount?: number): [number, number][] {
  const sets = specs.map((s) => new Set(parsePages(s, pageCount).pages));
  const out: [number, number][] = [];
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      if ([...sets[i]!].some((p) => sets[j]!.has(p))) out.push([i, j]);
    }
  }
  return out;
}
