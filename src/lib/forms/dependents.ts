/**
 * "When this field is filled / ticked, show those fields" (iForms: «אם השדה מולא – פתח את השדה הבא»), set from the
 * source field instead of from each target. Stored as an ordinary `visibleIf` on every target, so the renderer, the
 * on-document fill, server validation and the PDF need nothing new. Pure, unit tested.
 */
import { conditionFieldRefs } from "./conditions";
import { FIELD_TYPE_META } from "./field-types";
import { allFields, type Condition, type FormDefinition, type FormField } from "./schema";

type Leaf = { field: string; op: "eq" | "notEmpty" | "contains"; value?: unknown };

/** The rule "the source is filled / ticked", by the source's type. */
export function revealRule(source: Pick<FormField, "id" | "type">): Leaf {
  switch (source.type) {
    case "consent":
      return { field: source.id, op: "eq", value: true };
    case "yes_no":
      return { field: source.id, op: "eq", value: "yes" };
    default:
      return { field: source.id, op: "notEmpty" };
  }
}

/** How the rule reads in the builder: "מסומן" for a box, "כן" for yes/no, otherwise "מלא". */
export function revealWord(source: Pick<FormField, "type">): string {
  return source.type === "consent" ? "מסומן" : source.type === "yes_no" ? "התשובה כן" : "מלא";
}

const isLeaf = (c: Condition): c is { field: string; op: never; value?: unknown } => "field" in c;

/** The rules of a condition joined by AND, or null when it is something else (OR, NOT, nesting). */
function andRules(c: Condition | undefined): Condition[] | null {
  if (!c) return [];
  if (isLeaf(c)) return [c];
  if ("all" in c) return c.all;
  return null;
}

/** Fields shown only when `sourceId` is filled (their visibleIf mentions the source). */
export function dependentsOf(def: FormDefinition, sourceId: string): FormField[] {
  return allFields(def).filter((f) => f.id !== sourceId && conditionFieldRefs(f.visibleIf).includes(sourceId));
}

/** Fields that can be opened by the source: answerable, not the source, not already depending on it. */
export function dependentCandidates(def: FormDefinition, sourceId: string): FormField[] {
  const taken = new Set(dependentsOf(def, sourceId).map((f) => f.id));
  return allFields(def).filter((f) => f.id !== sourceId && !taken.has(f.id) && (FIELD_TYPE_META[f.type].hasAnswer || f.type === "section" || f.type === "heading" || f.type === "info_text"));
}

/** Does `fromId`'s visibility depend (directly or through other fields) on `onId`? */
export function visibilityDependsOn(def: FormDefinition, fromId: string, onId: string): boolean {
  const byId = new Map(allFields(def).map((f) => [f.id, f]));
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const ref of conditionFieldRefs(byId.get(id)?.visibleIf)) {
      if (ref === onId) return true;
      stack.push(ref);
    }
  }
  return false;
}

function mapField(def: FormDefinition, id: string, fn: (f: FormField) => FormField): FormDefinition {
  return { ...def, pages: def.pages.map((p) => ({ ...p, fields: p.fields.map((f) => (f.id === id ? fn(f) : f)) })) };
}

export type DependentResult = { def: FormDefinition; error?: undefined } | { def?: undefined; error: string };

/**
 * Show `targetId` only when `sourceId` is filled. A target that already has a simple (AND) condition keeps it and
 * gets this rule too; a target with an OR/complex condition is refused rather than silently changed.
 */
export function addDependent(def: FormDefinition, sourceId: string, targetId: string): DependentResult {
  const fields = allFields(def);
  const source = fields.find((f) => f.id === sourceId);
  const target = fields.find((f) => f.id === targetId);
  if (!source || !target) return { error: "השדה לא נמצא בטופס" };
  if (sourceId === targetId) return { error: "שדה לא יכול להיפתח על ידי עצמו" };
  if (visibilityDependsOn(def, sourceId, targetId)) return { error: `"${target.label || target.id}" כבר קובע אם השדה הזה מוצג – זה היה יוצר מעגל` };
  const rules = andRules(target.visibleIf);
  if (rules === null) return { error: `ל"${target.label || target.id}" יש כבר תנאי מורכב. ערכו אותו בהגדרות השדה עצמו.` };
  const rule = revealRule(source);
  const kept = rules.filter((r) => !(isLeaf(r) && r.field === sourceId));
  const next = [...kept, rule];
  return { def: mapField(def, targetId, (f) => ({ ...f, visibleIf: next.length === 1 ? next[0] : { all: next } })) };
}

/** Stop showing `targetId` depending on `sourceId` (other rules of the target stay). */
export function removeDependent(def: FormDefinition, sourceId: string, targetId: string): FormDefinition {
  return mapField(def, targetId, (f) => {
    const rules = andRules(f.visibleIf);
    if (rules === null) return f;
    const kept = rules.filter((r) => !(isLeaf(r) && r.field === sourceId));
    const { visibleIf: _drop, ...rest } = f;
    void _drop;
    return kept.length === 0 ? rest : { ...rest, visibleIf: kept.length === 1 ? kept[0] : { all: kept } };
  });
}

/** Text shown for a field in the searchable pickers: "שם פרטי · fname" (label first; the id disambiguates). */
export function pickerText(f: Pick<FormField, "id" | "label">): string {
  const label = (f.label ?? "").trim();
  return label && label !== f.id ? `${label} · ${f.id}` : f.id;
}

/**
 * The field the builder typed in a picker: the exact picker text, the id, or a label that only one field has.
 * Hebrew is matched as typed; ids ignore case and surrounding spaces.
 */
export function resolvePicked(candidates: Pick<FormField, "id" | "label">[], typed: string): string | null {
  const t = typed.trim();
  if (!t) return null;
  const byText = candidates.find((f) => pickerText(f) === t);
  if (byText) return byText.id;
  const byId = candidates.find((f) => f.id.toLowerCase() === t.toLowerCase());
  if (byId) return byId.id;
  const byLabel = candidates.filter((f) => (f.label ?? "").trim() === t);
  return byLabel.length === 1 ? byLabel[0]!.id : null;
}

/**
 * "Mark on the form, then save": make exactly `wanted` the fields that `sourceId` opens. New ones are added, unmarked
 * ones lose this rule; a field that cannot be linked (loop, complex condition) is skipped with its reason.
 */
export function setDependents(def: FormDefinition, sourceId: string, wanted: string[]): { def: FormDefinition; added: number; removed: number; errors: string[] } {
  const want = new Set(wanted.filter((id) => id !== sourceId));
  const now = new Set(dependentsOf(def, sourceId).map((f) => f.id));
  let next = def;
  let added = 0;
  let removed = 0;
  const errors: string[] = [];
  for (const id of now) {
    if (want.has(id)) continue;
    next = removeDependent(next, sourceId, id);
    removed++;
  }
  for (const id of want) {
    if (now.has(id)) continue;
    const r = addDependent(next, sourceId, id);
    if (r.def) {
      next = r.def;
      added++;
    } else errors.push(r.error);
  }
  return { def: next, added, removed, errors };
}
