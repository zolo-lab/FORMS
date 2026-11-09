/**
 * Form fields linked to a list (stage 2: the organizations' list, picked by the request's organization).
 *
 * A link is kept on the form field itself, in the two settings the engine already knows:
 * - a text field is filled from the organization: `prefill` = `org.name` | `org.registrationNumber` | `org.fields.<key>`;
 * - a choice field takes its options from the organization: `optionsSource` = `org.fields.<key>`. The form shows the
 *   options that organization has ticked in the lists screen (all of them when it ticked none – a gap to fix there).
 *
 * Nothing here reads the database: the list's fields come in as `OrgListField`s, the organization's values as a map.
 */
import { FIELD_TYPE_META, type FieldType } from "./field-types";
import type { Lookups } from "./lookups";
import { ORG_FIELD_IDS, ORG_FIELD_PREFIX, orgFieldKey, prefillOf } from "./prefill";
import { allFields, type FieldOption, type FormDefinition, type FormField } from "./schema";
import { uniqueId, updateField } from "./builder";
import { splitPicks } from "@/lib/lists/kinds";

/** A field of the organizations' list, as the builder and the fill need it. */
export interface OrgListField {
  /** `__name` and `__reg` are the fixed name and number; anything else is an `organization_field_defs` key. */
  key: string;
  label: string;
  kind: string;
  options: string[];
  multi: boolean;
}

export const ORG_NAME_KEY = "__name";
export const ORG_REG_KEY = "__reg";

/** The prefill key a text field gets for a list field. */
const prefillFor = (key: string) => (key === ORG_NAME_KEY ? "org.name" : key === ORG_REG_KEY ? "org.registrationNumber" : `${ORG_FIELD_PREFIX}${key}`);

/** Which field of the organizations' list fills this form field (or gives it its options), if any. */
export function bindingOf(f: Pick<FormField, "id" | "prefill" | "optionsSource">): string | undefined {
  const fromOptions = orgFieldKey(f.optionsSource);
  if (fromOptions) return fromOptions;
  const p = prefillOf(f);
  if (p === "org.name") return ORG_NAME_KEY;
  if (p === "org.registrationNumber") return ORG_REG_KEY;
  return orgFieldKey(p);
}

const isChoice = (type: FieldType) => FIELD_TYPE_META[type].hasOptions;

/** Form field types whose answer is one plain value, so an organization's value (a line of text) can stand in it. */
const PLAIN_TYPES = new Set<FieldType>(["short_text", "long_text", "number", "currency", "percent", "email", "phone", "id_number", "date", "hidden", "radio", "dropdown", "checkboxes"]);

/** May this form field show this list field? A choice list feeds any one-line field; a text one, no choice field. */
export function fits(field: Pick<FormField, "type">, lf: OrgListField): boolean {
  if (!PLAIN_TYPES.has(field.type)) return false;
  if (isChoice(field.type)) return lf.kind === "select";
  return true;
}

/** org_name / org_number are linked by their id alone: undoing the link would mean renaming them, so it is not offered. */
export const linkedById = (fieldId: string) => !!ORG_FIELD_IDS[fieldId];

const asOptions = (values: string[]): FieldOption[] => values.map((v) => ({ value: v, label: v }));

/** Link a form field to a list field: a choice takes the options, anything else is filled with the value. */
export function bindField(def: FormDefinition, fieldId: string, lf: OrgListField): FormDefinition {
  const field = allFields(def).find((f) => f.id === fieldId);
  if (!field) return def;
  if (isChoice(field.type)) {
    return updateField(def, fieldId, {
      optionsSource: `${ORG_FIELD_PREFIX}${lf.key}`,
      options: asOptions(lf.options),
      prefill: field.prefill?.startsWith("org.") ? undefined : field.prefill,
    });
  }
  return updateField(def, fieldId, {
    prefill: prefillFor(lf.key),
    optionsSource: orgFieldKey(field.optionsSource) ? undefined : field.optionsSource,
  });
}

/**
 * Undo a link. A choice keeps the options it had, as its own list. The field keeps its id (answers, PDF boxes and
 * steps are keyed by it); org_name / org_number, linked by that id, stay linked (see `linkedById`).
 */
export function unbindField(def: FormDefinition, fieldId: string): FormDefinition {
  const field = allFields(def).find((f) => f.id === fieldId);
  if (!field || linkedById(fieldId)) return def;
  return updateField(def, fieldId, {
    prefill: field.prefill?.startsWith("org.") ? undefined : field.prefill,
    optionsSource: orgFieldKey(field.optionsSource) ? undefined : field.optionsSource,
  });
}

/** The form field type a list field becomes when it is added to a form. */
export function fieldTypeFor(lf: OrgListField): FieldType {
  if (lf.kind === "select") return lf.multi ? "checkboxes" : "dropdown";
  const same: FieldType[] = ["short_text", "long_text", "number", "currency", "percent", "email", "phone", "id_number", "date", "yes_no"];
  return (same as string[]).includes(lf.kind) ? (lf.kind as FieldType) : "short_text";
}

/** Add a list field the form lacks, at the end of a page, already linked. Its id is the list field's internal name. */
export function addLinkedField(def: FormDefinition, lf: OrgListField, page: number): { def: FormDefinition; id: string } {
  const next = structuredClone(def);
  const type = fieldTypeFor(lf);
  // Not org_name / org_number: those are linked by id and could never be unlinked.
  const base = lf.key === ORG_NAME_KEY ? "org_title" : lf.key === ORG_REG_KEY ? "org_regnum" : lf.key.replace(/-/g, "_");
  const id = uniqueId(base, new Set(allFields(next).map((f) => f.id)));
  const field: FormField = { id, type, label: lf.label };
  if (FIELD_TYPE_META[type].defaultSettings) field.settings = structuredClone(FIELD_TYPE_META[type].defaultSettings);
  const target = next.pages[Math.min(Math.max(0, page), next.pages.length - 1)]!;
  target.fields.push(field);
  return { def: bindField(next, id, lf), id };
}

/** Labels compared the way people read them: no quotes or geresh, no extra spaces. */
export const sameLabel = (a: string, b: string) => norm(a) === norm(b);
const norm = (s: string) => s.replace(/["'״׳`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export type LinkRow =
  | { field: OrgListField; state: "bound"; formFieldIds: string[] }
  | { field: OrgListField; state: "suggested"; suggestion: string }
  | { field: OrgListField; state: "missing" };

/**
 * For each field of the list: the form fields linked to it; else a form field with the same name that could be
 * (and is not linked to anything else); else "missing" – the form has no place for it.
 */
export function linkReport(def: FormDefinition, listFields: OrgListField[]): LinkRow[] {
  const fields = allFields(def).filter((f) => FIELD_TYPE_META[f.type].hasAnswer);
  const linked = new Set(fields.filter((f) => bindingOf(f)).map((f) => f.id));
  const offered = new Set<string>();
  return listFields.map((lf): LinkRow => {
    const bound = fields.filter((f) => bindingOf(f) === lf.key).map((f) => f.id);
    if (bound.length) return { field: lf, state: "bound", formFieldIds: bound };
    const match = fields.find((f) => !linked.has(f.id) && !offered.has(f.id) && sameLabel(f.label, lf.label) && fits(f, lf));
    if (match) {
      offered.add(match.id);
      return { field: lf, state: "suggested", suggestion: match.id };
    }
    return { field: lf, state: "missing" };
  });
}

/** The options an organization shows in a choice linked to this list field: what it ticked, else all of them. */
export function allowedOptions(lf: OrgListField, value: string | undefined): string[] {
  const picked = new Set(splitPicks(value ?? "", lf.options));
  const mine = lf.options.filter((o) => picked.has(o));
  return mine.length ? mine : [...lf.options];
}

/**
 * The form as one organization sees it: each choice linked to the list gets that organization's options as a fixed
 * list, so the renderer shows them and `validateAnswers` accepts only them. Without an organization: every option.
 */
export function withOrgOptions(def: FormDefinition, orgValues: Record<string, string> | null | undefined, listFields: OrgListField[]): FormDefinition {
  const byKey = new Map(listFields.map((f) => [f.key, f]));
  const fix = (f: FormField): FormField => {
    const key = orgFieldKey(f.optionsSource);
    const nested = f.fields ? { fields: f.fields.map(fix) } : {};
    if (!key) return { ...f, ...nested };
    const lf = byKey.get(key);
    const rest: FormField = { ...f, ...nested, options: lf ? asOptions(allowedOptions(lf, orgValues?.[key])) : [] };
    delete rest.optionsSource;
    return rest;
  };
  return { ...def, pages: def.pages.map((p) => ({ ...p, fields: p.fields.map(fix) })) };
}

/**
 * For the new-request wizard, where the organization is picked on the page: every option under the field's source,
 * and each organization's own under `<source>@<orgId>`.
 */
export function orgChoiceLookups(defs: FormDefinition[], orgs: { id: string; fieldValues: Record<string, string> | null }[], listFields: OrgListField[]): Lookups {
  const keys = new Set<string>();
  for (const d of defs) for (const f of allFields(d)) {
    const k = orgFieldKey(f.optionsSource);
    if (k) keys.add(k);
  }
  const out: Lookups = {};
  for (const key of keys) {
    const lf = listFields.find((f) => f.key === key);
    if (!lf) continue;
    out[`${ORG_FIELD_PREFIX}${key}`] = asOptions(lf.options);
    for (const o of orgs) out[`${ORG_FIELD_PREFIX}${key}@${o.id}`] = asOptions(allowedOptions(lf, o.fieldValues?.[key]));
  }
  return out;
}

/** The wizard's lookups once an organization is chosen: its own options replace the full lists. */
export function lookupsForOrg(lookups: Lookups, orgId: string | null | undefined): Lookups {
  if (!orgId) return lookups;
  const out: Lookups = { ...lookups };
  const suffix = `@${orgId}`;
  for (const [k, v] of Object.entries(lookups)) if (k.endsWith(suffix)) out[k.slice(0, -suffix.length)] = v;
  return out;
}
