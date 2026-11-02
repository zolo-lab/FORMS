/**
 * Scores field detection against a known answer: which expected fields were found (by name, page and place),
 * whether their type and options are right, what was found that should not have been. Pure; used by the detection
 * test bank (tests/detection) and the scoreboard script.
 */
import type { FieldType } from "@/lib/forms/field-types";
import type { DetectedField } from "./detect";
import { normalizeText } from "./match";

export interface ExpectedFieldSpec {
  label: string;
  type: FieldType;
  page: number;
  area?: { x: number; y: number; width: number; height: number };
  options?: string[];
  labelOnly?: boolean;
}

export type Problem =
  | { kind: "missing"; label: string }
  | { kind: "type"; label: string; expected: FieldType; got: FieldType }
  | { kind: "options"; label: string; expected: string[]; got: string[] }
  | { kind: "place"; label: string }
  | { kind: "extra"; label: string; type: FieldType }
  | { kind: "notField"; label: string };

export interface CaseScore {
  expected: number;
  /** Found with the right name, page and place. */
  found: number;
  /** Found and fully right (type and options too). */
  correct: number;
  extras: number;
  problems: Problem[];
}

const norm = (s: string) => normalizeText(s).replace(/[:׳"'.]/g, "").trim();

/** Same name: equal, or one contains the other (detection trims remarks and colons). */
export function sameName(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x)));
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, slack = 6): boolean {
  return a.x < b.x + b.width + slack && b.x < a.x + a.width + slack && a.y < b.y + b.height + slack && b.y < a.y + a.height + slack;
}

export function scoreDetection(detected: DetectedField[], expected: ExpectedFieldSpec[], notFields: string[] = []): CaseScore {
  const used = new Set<DetectedField>();
  const problems: Problem[] = [];
  let found = 0;
  let correct = 0;
  // Fields with options and places first: they are the most specific matches.
  const order = [...expected].sort((a, b) => (b.options ? 1 : 0) - (a.options ? 1 : 0));
  for (const e of order) {
    const candidates = detected.filter((d) => !used.has(d) && d.page === e.page && sameName(d.label, e.label));
    const placed = e.area ? candidates.filter((d) => overlaps(d.box, e.area!)) : candidates;
    const hit = placed[0] ?? candidates[0];
    if (!hit) { problems.push({ kind: "missing", label: e.label }); continue; }
    used.add(hit);
    if (e.area && !placed.length) { problems.push({ kind: "place", label: e.label }); continue; }
    found++;
    let ok = true;
    if (hit.type !== e.type) { problems.push({ kind: "type", label: e.label, expected: e.type, got: hit.type }); ok = false; }
    if (e.options) {
      const got = (hit.options ?? []).map((o) => o.label);
      const a = e.options.map(norm).sort().join("|");
      const b = got.map(norm).sort().join("|");
      if (a !== b) { problems.push({ kind: "options", label: e.label, expected: e.options, got }); ok = false; }
    }
    if (ok) correct++;
  }
  let extras = 0;
  for (const d of detected) {
    if (used.has(d) || d.skip) continue;
    if (notFields.some((t) => sameName(t, d.label))) problems.push({ kind: "notField", label: d.label });
    else problems.push({ kind: "extra", label: d.label, type: d.type });
    extras++;
  }
  return { expected: expected.length, found, correct, extras, problems };
}

/** One line per problem, in Hebrew, for the scoreboard. */
export function describeProblem(p: Problem): string {
  switch (p.kind) {
    case "missing": return `חסר: "${p.label}"`;
    case "place": return `במקום הלא נכון: "${p.label}"`;
    case "type": return `סוג: "${p.label}" צריך ${p.expected}, יצא ${p.got}`;
    case "options": return `אפשרויות: "${p.label}" צריך [${p.expected.join(", ")}], יצא [${p.got.join(", ")}]`;
    case "extra": return `מיותר: "${p.label}" (${p.type})`;
    case "notField": return `כותרת/הסבר שהפכו לשדה: "${p.label}"`;
  }
}
