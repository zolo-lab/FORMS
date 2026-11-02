/**
 * Value copy, as in iForms: a field whose id is another field's id plus a number ("fname1", "fname2" for "fname")
 * starts with that field's value. The filler may type over the copy; an untouched copy keeps following its source.
 * `settings.noCopy` turns it off for one field ("ללא העתקה" in iForms).
 *
 * Pure; the browser applies it live, the signing page when it loads (so a source from an earlier step counts) and
 * the server again on submit.
 */
import type { Answers } from "./conditions";
import { allFields, type FormDefinition, type FormField } from "./schema";
import type { FieldType } from "./field-types";

/** Kinds of value that may copy into each other (a short answer may land in a long one, an id number in text…). */
const TEXTISH = new Set<FieldType>(["short_text", "long_text", "number", "id_number", "phone", "email"]);
const COPYABLE = new Set<FieldType>([...TEXTISH, "date", "time", "currency", "percent"]);

const compatible = (from: FieldType, to: FieldType) => from === to || (TEXTISH.has(from) && TEXTISH.has(to));

/** The id this field copies from, when it is one of `ids` (or undefined). */
export function copySourceOf(field: FormField, ids: Set<string>): string | undefined {
  if (field.settings?.noCopy === true || !COPYABLE.has(field.type) || field.formula) return undefined;
  const m = /^(.*\D)\d+$/.exec(field.id);
  return m && ids.has(m[1]!) ? m[1] : undefined;
}

/**
 * Copy fields of the form → their source id. A source is a field of the form of a compatible kind, or – for a
 * step that only holds part of the form – an id that already has a plain answer (`answers`).
 */
export function copyTargets(def: FormDefinition, answers: Answers = {}): Record<string, string> {
  const fields = allFields(def);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const plain = Object.keys(answers).filter((k) => typeof answers[k] === "string" || typeof answers[k] === "number");
  const ids = new Set([...byId.keys(), ...plain]);
  const out: Record<string, string> = {};
  for (const f of fields) {
    const src = copySourceOf(f, ids);
    if (!src) continue;
    const from = byId.get(src);
    if (from && !compatible(from.type, f.type)) continue;
    out[f.id] = src;
  }
  return out;
}

const blank = (v: unknown) => v === undefined || v === null || v === "";

/** Answers with every empty copy field holding its source's value. Same object when nothing changes. */
export function withCopies(def: FormDefinition, answers: Answers): Answers {
  let out: Answers | null = null;
  for (const [target, src] of Object.entries(copyTargets(def, answers))) {
    const v = answers[src];
    if (!blank(answers[target]) || blank(v)) continue;
    out ??= { ...answers };
    out[target] = v as Answers[string];
  }
  return out ?? answers;
}

/** The field this one copies from, or would copy from without "no copy" (for the builder). */
export function copySourceInForm(def: FormDefinition, field: FormField): FormField | undefined {
  const settings = { ...field.settings };
  delete settings.noCopy;
  const probe: FormField = { ...field, settings };
  const single: FormDefinition = { ...def, pages: def.pages.map((p) => ({ ...p, fields: p.fields.map((f) => (f.id === field.id ? probe : f)) })) };
  const src = copyTargets(single)[field.id];
  return src ? allFields(def).find((f) => f.id === src) : undefined;
}
