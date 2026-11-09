/**
 * Form fields linked to a list.
 *
 * Two sources: the organizations' list (`org`), whose record is the request's organization, and any list type
 * (`list:<typeId>`), whose record the filler picks in a dropdown of the form (the "picker"). A link is kept on the
 * form field itself, in the two settings the engine already knows:
 * - a text field is filled with the record's value: `prefill` = `org.name` | `org.registrationNumber` |
 *   `org.fields.<key>` | `list.<typeId>.<key>`;
 * - a choice field takes its options from the record: `optionsSource` = `org.fields.<key>` | `list.<typeId>.<key>`.
 *   The form shows the options that record has ticked in the lists screen (all of them when it ticked none).
 * - the picker: a dropdown with `optionsSource` = `list.<typeId>` whose options are the records.
 *
 * Nothing here reads the database: the list's fields come in as `LinkedListField`s, a record's values as a map.
 */
import { FIELD_TYPE_META, type FieldType } from "./field-types";
import type { Answers } from "./conditions";
import type { Lookups } from "./lookups";
import { ORG_FIELD_IDS, ORG_FIELD_PREFIX, orgFieldKey, prefillOf } from "./prefill";
import { allFields, type FieldOption, type FormDefinition, type FormField } from "./schema";
import { uniqueId, updateField } from "./builder";
import { splitPicks } from "@/lib/lists/kinds";

/** A field of a list, as the builder and the fill need it. */
export interface LinkedListField {
  /** For the organizations: `__name` and `__reg` are the fixed name and number, the rest `organization_field_defs` keys. */
  key: string;
  label: string;
  kind: string;
  options: string[];
  /** Always true for a choice: a record's value is the set of options it offers. Kept for the sheet's shape. */
  multi: boolean;
}

/** @deprecated use LinkedListField */
export type OrgListField = LinkedListField;

export const ORG_NAME_KEY = "__name";
export const ORG_REG_KEY = "__reg";

/** Where a link reads from: the organizations' list, or a list type (by id). */
export type LinkSource = "org" | `list:${string}`;
export const listSource = (typeId: string): LinkSource => `list:${typeId}`;
export const sourceTypeId = (source: LinkSource): string | null => (source === "org" ? null : source.slice(5));

const LIST_PREFIX = "list.";

/** The prefill / optionsSource key a form field gets for a list field. */
export function keyFor(source: LinkSource, key: string): string {
  if (source !== "org") return `${LIST_PREFIX}${sourceTypeId(source)}.${key}`;
  return key === ORG_NAME_KEY ? "org.name" : key === ORG_REG_KEY ? "org.registrationNumber" : `${ORG_FIELD_PREFIX}${key}`;
}

/** The picker's optionsSource: the records of a list type. */
export const pickerKey = (typeId: string) => `${LIST_PREFIX}${typeId}`;

/** What a prefill / optionsSource key points at, if it points at a list at all. */
export function parseKey(k: string | undefined): { source: LinkSource; key: string } | { source: LinkSource; picker: true } | undefined {
  if (!k) return undefined;
  if (k === "org.name") return { source: "org", key: ORG_NAME_KEY };
  if (k === "org.registrationNumber") return { source: "org", key: ORG_REG_KEY };
  const org = orgFieldKey(k);
  if (org) return { source: "org", key: org };
  if (!k.startsWith(LIST_PREFIX)) return undefined;
  const rest = k.slice(LIST_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot < 0) return rest ? { source: listSource(rest), picker: true } : undefined;
  const typeId = rest.slice(0, dot);
  const key = rest.slice(dot + 1);
  return typeId && key ? { source: listSource(typeId), key } : undefined;
}

/** Which list field fills this form field (or gives it its options), if any, within one source. */
export function bindingOf(f: Pick<FormField, "id" | "prefill" | "optionsSource">, source: LinkSource = "org"): string | undefined {
  const fromOptions = parseKey(f.optionsSource);
  if (fromOptions && "key" in fromOptions && fromOptions.source === source) return fromOptions.key;
  const p = parseKey(prefillOf(f));
  return p && "key" in p && p.source === source ? p.key : undefined;
}

/** The list type whose records this form field picks, if it is a picker. */
export function pickerOf(f: Pick<FormField, "optionsSource">): string | null {
  const p = parseKey(f.optionsSource);
  return p && "picker" in p ? sourceTypeId(p.source) : null;
}

/** Whether a prefill / optionsSource key belongs to any list link. */
const isLinkKey = (k: string | undefined) => !!parseKey(k);

const isChoice = (type: FieldType) => FIELD_TYPE_META[type].hasOptions;

/** Form field types whose answer is one plain value, so an organization's value (a line of text) can stand in it. */
const PLAIN_TYPES = new Set<FieldType>(["short_text", "long_text", "number", "currency", "percent", "email", "phone", "id_number", "date", "hidden", "radio", "dropdown", "checkboxes"]);

/** May this form field show this list field? A choice list feeds any one-line field; a text one, no choice field. */
export function fits(field: Pick<FormField, "type">, lf: LinkedListField): boolean {
  if (!PLAIN_TYPES.has(field.type)) return false;
  if (isChoice(field.type)) return lf.kind === "select";
  // A typed field is locked once filled and skips its own check, so it only takes a value of the same kind
  // (an e-mail field never shows free text that a request would then use as an address).
  const strict = STRICT[field.type];
  return strict ? strict.includes(lf.kind) : true;
}

/** Typed form fields and the list kinds whose values already pass their check. Text fields take any kind. */
const STRICT: Partial<Record<FieldType, string[]>> = {
  email: ["email"],
  phone: ["phone"],
  id_number: ["id_number"],
  date: ["date"],
  number: ["number", "currency", "percent"],
  currency: ["number", "currency"],
  percent: ["number", "percent"],
};

/** org_name / org_number are linked by their id alone: undoing the link would mean renaming them, so it is not offered. */
export const linkedById = (fieldId: string) => Object.hasOwn(ORG_FIELD_IDS, fieldId);

const asOptions = (values: string[]): FieldOption[] => values.map((v) => ({ value: v, label: v }));

/** Link a form field to a list field: a choice takes the options, anything else is filled with the value. */
export function bindField(def: FormDefinition, fieldId: string, lf: LinkedListField, source: LinkSource = "org"): FormDefinition {
  const field = allFields(def).find((f) => f.id === fieldId);
  // org_name / org_number are bound by their id to the name and number; a second link could never be undone.
  // A picker chooses the record for the other fields: linking it to a field would leave them with no record.
  if (!field || linkedById(fieldId) || pickerOf(field)) return def;
  if (isChoice(field.type)) {
    return updateField(def, fieldId, {
      optionsSource: keyFor(source, lf.key),
      options: asOptions(lf.options),
      prefill: isLinkKey(field.prefill) ? undefined : field.prefill,
    });
  }
  return updateField(def, fieldId, {
    prefill: keyFor(source, lf.key),
    optionsSource: isLinkKey(field.optionsSource) ? undefined : field.optionsSource,
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
    prefill: isLinkKey(field.prefill) ? undefined : field.prefill,
    optionsSource: isLinkKey(field.optionsSource) ? undefined : field.optionsSource,
  });
}

/** The form field type a list field becomes when it is added to a form. */
export function fieldTypeFor(lf: LinkedListField): FieldType {
  // A choice starts as a dropdown; the builder turns it into radios or ticks (one or several is the form's call).
  if (lf.kind === "select") return "dropdown";
  const same: FieldType[] = ["short_text", "long_text", "number", "currency", "percent", "email", "phone", "id_number", "date", "yes_no"];
  return (same as string[]).includes(lf.kind) ? (lf.kind as FieldType) : "short_text";
}

/** Add a list field the form lacks, at the end of a page, already linked. Its id is the list field's internal name. */
export function addLinkedField(def: FormDefinition, lf: LinkedListField, page: number, source: LinkSource = "org"): { def: FormDefinition; id: string } {
  const next = structuredClone(def);
  const type = fieldTypeFor(lf);
  // Not org_name / org_number: those are linked by id and could never be unlinked.
  const base = lf.key === ORG_NAME_KEY ? "org_title" : lf.key === ORG_REG_KEY ? "org_regnum" : lf.key.replace(/-/g, "_");
  // The reserved ids are never handed out, even when an organization field's own key is one of them.
  const id = uniqueId(base, new Set([...allFields(next).map((f) => f.id), ...Object.keys(ORG_FIELD_IDS)]));
  const field: FormField = { id, type, label: lf.label };
  if (FIELD_TYPE_META[type].defaultSettings) field.settings = structuredClone(FIELD_TYPE_META[type].defaultSettings);
  const target = next.pages[Math.min(Math.max(0, page), next.pages.length - 1)]!;
  target.fields.push(field);
  return { def: bindField(next, id, lf, source), id };
}

/**
 * The picker of a list type: the dropdown in which the filler chooses the record. The first one found, or a new
 * one at the top of the page (before the fields it fills).
 */
export function pickerFor(def: FormDefinition, typeId: string): FormField | undefined {
  return allFields(def).find((f) => pickerOf(f) === typeId);
}

export function addPicker(def: FormDefinition, typeId: string, typeName: string, page: number): { def: FormDefinition; id: string } {
  const next = structuredClone(def);
  const id = uniqueId(`pick_${typeId.slice(0, 8)}`, new Set([...allFields(next).map((f) => f.id), ...Object.keys(ORG_FIELD_IDS)]));
  const field: FormField = { id, type: "dropdown", label: typeName, required: true, optionsSource: pickerKey(typeId), options: [] };
  const target = next.pages[Math.min(Math.max(0, page), next.pages.length - 1)]!;
  target.fields.unshift(field);
  return { def: next, id };
}

/** Labels compared the way people read them: no quotes or geresh, no extra spaces. */
export const sameLabel = (a: string, b: string) => norm(a) === norm(b);
const norm = (s: string) => s.replace(/["'״׳`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export type LinkRow =
  | { field: LinkedListField; state: "bound"; formFieldIds: string[] }
  | { field: LinkedListField; state: "suggested"; suggestion: string }
  | { field: LinkedListField; state: "missing" };

/**
 * For each field of the list: the form fields linked to it; else a form field with the same name that could be
 * (and is not linked to anything else); else "missing" – the form has no place for it.
 */
export function linkReport(def: FormDefinition, listFields: LinkedListField[], source: LinkSource = "org"): LinkRow[] {
  const fields = allFields(def).filter((f) => FIELD_TYPE_META[f.type].hasAnswer);
  // Linked to anything (any source, or a picker): not offered again.
  const linked = new Set(fields.filter((f) => isLinkKey(f.optionsSource) || isLinkKey(prefillOf(f))).map((f) => f.id));
  const offered = new Set<string>();
  return listFields.map((lf): LinkRow => {
    const bound = fields.filter((f) => bindingOf(f, source) === lf.key).map((f) => f.id);
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
export function allowedOptions(lf: LinkedListField, value: string | string[] | undefined): string[] {
  const picked = new Set(Array.isArray(value) ? value : splitPicks(value ?? "", lf.options));
  const mine = lf.options.filter((o) => picked.has(o));
  return mine.length ? mine : [...lf.options];
}

/**
 * The form as one organization sees it: each choice linked to the list gets that organization's options as a fixed
 * list, so the renderer shows them and `validateAnswers` accepts only them. Without an organization: every option.
 */
export function withOrgOptions(def: FormDefinition, orgValues: Record<string, string> | null | undefined, listFields: LinkedListField[]): FormDefinition {
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
export function orgChoiceLookups(defs: FormDefinition[], orgs: { id: string; fieldValues: Record<string, string> | null }[], listFields: LinkedListField[]): Lookups {
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

// ---------------------------------------------------------------------------------------------------------------
// Lists picked in the form (any list type): the picker's options carry each record's linked values, so the form
// fills its fields the moment a record is chosen, and the server does the same again on submit.

/** A record of a list, as the picker's lookups carry it. */
export interface RecordOption extends FieldOption {
  /** The record's values by list-field key (a choice field's value is the set of options it offers). */
  data?: Record<string, string | string[]>;
}

/** A value of a record as a text field shows it: several picks on one line. */
const asLine = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v.join(", ") : v);

const NUMERIC: ReadonlySet<FieldType> = new Set(["number", "currency", "percent"]);

/** A record's value as the form field stores it: a number for a numeric field, a line of text otherwise. */
function valueForField(f: FormField, v: string | string[] | undefined): unknown {
  const line = asLine(v);
  if (line === undefined || line === "") return undefined;
  if (NUMERIC.has(f.type)) {
    const n = Number(line.replace(/[,\s₪%]/g, ""));
    return Number.isFinite(n) ? n : line;
  }
  return line;
}

/**
 * Answers with every list-linked field filled from the record its picker holds – or emptied when none is picked.
 * A picker with exactly one record to offer is set to it, so a list of one needs no choosing. A picker whose records
 * the lookups do not carry is left alone (the caller has no data to fill from).
 *
 * `full` is where the pickers are looked for: the whole form when `def` is one role's view of it, so a record picked
 * in an earlier step still fills this step's fields.
 */
export function withListPicks(def: FormDefinition, answers: Answers, lookups: Lookups, full: FormDefinition = def): Answers {
  let out: Answers | null = null;
  const set = (id: string, v: unknown) => {
    if (answers[id] === v || (v === undefined && answers[id] === undefined)) return;
    out ??= { ...answers };
    if (v === undefined) delete out[id];
    else out[id] = v as Answers[string];
  };
  const fields = allFields(def);
  const pickers = allFields(full).filter((f) => pickerOf(f));
  const inView = new Set(fields.map((f) => f.id));
  for (const picker of pickers) {
    const typeId = pickerOf(picker)!;
    const records = lookups[pickerKey(typeId)] as RecordOption[] | undefined;
    if (!records) continue;
    let chosen = answers[picker.id];
    if (typeof chosen !== "string" || !records.some((r) => r.value === chosen)) chosen = records.length === 1 ? records[0]!.value : undefined;
    if (inView.has(picker.id)) set(picker.id, chosen);
    const data = records.find((r) => r.value === chosen)?.data;
    for (const f of fields) {
      const p = parseKey(prefillOf(f));
      if (!p || !("key" in p) || p.source !== listSource(typeId)) continue;
      set(f.id, data ? valueForField(f, data[p.key]) : undefined);
    }
  }
  return out ?? answers;
}

/**
 * The form with each choice linked to a picked record narrowed to that record's options (fixed, so the renderer
 * shows them and `validateAnswers` accepts only them). Without a record: every option the list field has.
 */
export function narrowListChoices(def: FormDefinition, answers: Answers, lookups: Lookups, full: FormDefinition = def): FormDefinition {
  const fields = allFields(def);
  const chosen = new Map<string, RecordOption | undefined>();
  for (const f of allFields(full)) {
    const typeId = pickerOf(f);
    if (typeId) chosen.set(typeId, ((lookups[pickerKey(typeId)] ?? []) as RecordOption[]).find((r) => r.value === answers[f.id]));
  }
  if (!fields.some((f) => { const p = parseKey(f.optionsSource); return p && "key" in p && p.source !== "org"; })) return def;
  const fix = (f: FormField): FormField => {
    const nested = f.fields ? { fields: f.fields.map(fix) } : {};
    const p = parseKey(f.optionsSource);
    if (!p || !("key" in p) || p.source === "org") return { ...f, ...nested };
    const all = lookups[f.optionsSource!] ?? f.options ?? [];
    const typeId = sourceTypeId(p.source)!;
    const record = chosen.get(typeId);
    const mine = record?.data?.[p.key];
    const allowed = new Set(Array.isArray(mine) ? mine : mine ? [mine] : []);
    const rest: FormField = { ...f, ...nested, options: allowed.size ? all.filter((o) => allowed.has(o.value)) : all };
    delete rest.optionsSource;
    return rest;
  };
  return { ...def, pages: def.pages.map((p) => ({ ...p, fields: p.fields.map(fix) })) };
}

/** Whether a form field is filled from a list picked in the form (and so locked, its value the record's). */
export const isListFilled = (f: Pick<FormField, "id" | "prefill">) => {
  const p = parseKey(prefillOf(f));
  return !!p && "key" in p && p.source !== "org";
};

/** The form with list-linked text fields locked: their value is the record's, not the filler's to change. */
export function lockListFields(def: FormDefinition): FormDefinition {
  const fix = (f: FormField): FormField => {
    const nested = f.fields ? { fields: f.fields.map(fix) } : {};
    return isListFilled(f) ? { ...f, ...nested, readOnly: true } : { ...f, ...nested };
  };
  return { ...def, pages: def.pages.map((p) => ({ ...p, fields: p.fields.map(fix) })) };
}

/** The list types a set of forms reads from (pickers and linked fields), for loading their records. */
export function linkedTypeIds(defs: FormDefinition[]): string[] {
  const ids = new Set<string>();
  for (const d of defs) for (const f of allFields(d)) {
    for (const k of [f.optionsSource, prefillOf(f)]) {
      const p = parseKey(k);
      if (p && p.source !== "org") ids.add(sourceTypeId(p.source)!);
    }
  }
  return [...ids];
}
