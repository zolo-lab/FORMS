/**
 * Tools for cleaning up what PDF detection got wrong, changing the form and its boxes on the document together:
 *  - a tick box ("הצהרה / אישור") that is really a place to write (Form 101: "מספר ילדים…") becomes a text-like
 *    field, and its X box becomes a writing box – or the other way round;
 *  - an option that detection put under the wrong field (Form 101: "נקבה" under "מצב משפחתי") moves to the right
 *    one together with its X on the document.
 * Conditions that pointed at the old shape are carried over. Pure, unit tested.
 */
import { SWITCHABLE_TYPES } from "./builder";
import { allFields, type Condition, type FormDefinition, type FormField } from "./schema";
import type { FieldType } from "./field-types";
import type { PdfStamp } from "./pdf-mapping";
import { FIELD_TYPE_META } from "./field-types";

const TEXTISH = new Set<FieldType>(SWITCHABLE_TYPES);

/** Types a field of `type` can become here (beyond the text-to-text switches the builder already had). */
export function boxSwitchTargets(type: FieldType): FieldType[] {
  if (type === "consent") return [...SWITCHABLE_TYPES];
  if (TEXTISH.has(type)) return ["consent"];
  return [];
}

export type FixResult = { def: FormDefinition; stamps: PdfStamp[]; error?: undefined } | { error: string; def?: undefined; stamps?: undefined };

function mapFields(def: FormDefinition, fn: (f: FormField) => FormField): FormDefinition {
  return { ...def, pages: def.pages.map((p) => ({ ...p, fields: p.fields.map(fn), visibleIf: p.visibleIf })) };
}

function mapCondition(c: Condition | undefined, fn: (leaf: { field: string; op: string; value?: unknown }) => Condition): Condition | undefined {
  if (!c) return c;
  if ("all" in c) return { all: c.all.map((x) => mapCondition(x, fn)!) };
  if ("any" in c) return { any: c.any.map((x) => mapCondition(x, fn)!) };
  if ("not" in c) return { not: mapCondition(c.not, fn)! };
  return fn(c);
}

/** Every condition of the form (fields and pages) passed through `fn`. */
function mapAllConditions(def: FormDefinition, fn: (leaf: { field: string; op: string; value?: unknown }) => Condition): FormDefinition {
  const field = (f: FormField): FormField => {
    const out: FormField = { ...f };
    for (const k of ["visibleIf", "requiredIf", "disabledIf"] as const) if (f[k]) out[k] = mapCondition(f[k], fn);
    return out;
  };
  return { ...def, pages: def.pages.map((p) => ({ ...p, visibleIf: mapCondition(p.visibleIf, fn), fields: p.fields.map(field) })) };
}

/**
 * Turn a tick box into a text-like field (or back). Its boxes on the document change with it: an X becomes a
 * writing box, a writing box (or cells) becomes an X. "Is ticked" rules about it become "is filled", and back.
 */
export function switchBoxType(def: FormDefinition, stamps: PdfStamp[], fieldId: string, to: FieldType): FixResult {
  const field = allFields(def).find((f) => f.id === fieldId);
  if (!field) return { error: "השדה לא נמצא" };
  if (!boxSwitchTargets(field.type).includes(to)) return { error: `אי אפשר להפוך ${FIELD_TYPE_META[field.type].label} ל${FIELD_TYPE_META[to].label} כאן` };
  const toBox = to === "consent";
  let next = mapFields(def, (f) => {
    if (f.id !== fieldId) return f;
    const settings: Record<string, unknown> = { ...(f.settings ?? {}) };
    for (const k of Object.keys(FIELD_TYPE_META[f.type].defaultSettings ?? {})) delete settings[k];
    Object.assign(settings, FIELD_TYPE_META[to].defaultSettings ?? {});
    const { placeholder: _p, validation: _v, ...rest } = f;
    void _p;
    void _v;
    return { ...(toBox ? rest : f), type: to, settings: Object.keys(settings).length ? settings : undefined };
  });
  next = mapAllConditions(next, (leaf) => {
    if (leaf.field !== fieldId) return leaf as Condition;
    if (!toBox && leaf.op === "eq" && leaf.value === true) return { field: fieldId, op: "notEmpty" };
    if (!toBox && leaf.op === "neq" && leaf.value === true) return { field: fieldId, op: "empty" };
    if (toBox && leaf.op === "notEmpty") return { field: fieldId, op: "eq", value: true };
    if (toBox && leaf.op === "empty") return { field: fieldId, op: "neq", value: true };
    return leaf as Condition;
  });
  const nextStamps = stamps.map((s): PdfStamp => {
    if (s.fieldId !== fieldId) return s;
    if (toBox && (s.kind === "text" || s.kind === "comb")) {
      const { comb: _c, ...rest } = s;
      void _c;
      return { ...rest, kind: "check" };
    }
    if (!toBox && s.kind === "check" && s.whenValue === undefined) return { ...s, kind: "text" };
    return s;
  });
  return { def: next, stamps: nextStamps };
}

const OPTION_TYPES = new Set<FieldType>(["radio", "checkboxes", "dropdown"]);

/** Fields an option of `fromId` can move to: other single/multiple choice fields with a hand-written list. */
export function optionMoveTargets(def: FormDefinition, fromId: string): FormField[] {
  return allFields(def).filter((f) => f.id !== fromId && OPTION_TYPES.has(f.type) && !f.optionsSource);
}

function freeValue(f: FormField): string {
  const used = new Set((f.options ?? []).map((o) => o.value));
  let n = (f.options ?? []).length + 1;
  while (used.has(`o${n}`)) n++;
  return `o${n}`;
}

/**
 * Move one option (and its X on the document) from one choice field to another. It gets a value that is free in
 * the target; rules that tested the old field for this option now test the new field.
 */
export function moveOption(def: FormDefinition, stamps: PdfStamp[], fromId: string, value: string, toId: string): FixResult {
  const fields = allFields(def);
  const from = fields.find((f) => f.id === fromId);
  const to = fields.find((f) => f.id === toId);
  if (!from || !to) return { error: "השדה לא נמצא" };
  if (!optionMoveTargets(def, fromId).some((f) => f.id === toId)) return { error: `אפשר להעביר רק לשדה בחירה עם רשימה ידנית` };
  const option = (from.options ?? []).find((o) => o.value === value);
  if (!option) return { error: "האפשרות לא נמצאה" };
  const newValue = freeValue(to);
  let next = mapFields(def, (f) => {
    if (f.id === fromId) return { ...f, options: (f.options ?? []).filter((o) => o.value !== value), defaultValue: f.defaultValue === value ? undefined : f.defaultValue };
    if (f.id === toId) return { ...f, options: [...(f.options ?? []), { ...option, value: newValue }] };
    return f;
  });
  next = mapAllConditions(next, (leaf) => {
    if (leaf.field !== fromId) return leaf as Condition;
    const v = leaf.value;
    if ((leaf.op === "eq" || leaf.op === "neq" || leaf.op === "contains" || leaf.op === "notContains") && v === value) return { ...leaf, field: toId, value: newValue } as Condition;
    return leaf as Condition;
  });
  const nextStamps = stamps.map((s) => (s.fieldId === fromId && s.whenValue === value ? { ...s, fieldId: toId, whenValue: newValue } : s));
  return { def: next, stamps: nextStamps };
}
