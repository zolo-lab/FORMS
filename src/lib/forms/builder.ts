/**
 * Pure editing operations for the form builder. Every function returns a new
 * FormDefinition (never mutates), so the UI can keep undo history cheaply.
 */
import { conditionFieldRefs } from "./conditions";
import { FIELD_TYPE_META, type FieldType } from "./field-types";
import { parseFormDefinition, type Condition, type FieldOption, type FormDefinition, type FormField, type FormPage } from "./schema";

export type Location = { page: number; index: number };

export function blankForm(title = "טופס חדש"): FormDefinition {
  return { schemaVersion: 1, title, pages: [{ id: "page_1", title: "עמוד 1", fields: [] }], settings: { layout: "wizard" } };
}

function allIds(def: FormDefinition): Set<string> {
  return new Set(def.pages.flatMap((p) => p.fields.map((f) => f.id)));
}

/** Unique snake-case id from a base ("short_text" → "short_text_1", "_2"…). */
export function uniqueId(base: string, taken: Set<string>): string {
  const clean = base.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[^a-zA-Z]+/, "") || "field";
  if (!taken.has(clean)) return clean;
  let n = 2;
  while (taken.has(`${clean}_${n}`)) n++;
  return `${clean}_${n}`;
}

export function defaultOptions(count = 2): FieldOption[] {
  return Array.from({ length: count }, (_, i) => ({ value: `o${i + 1}`, label: `אפשרות ${i + 1}` }));
}

export function newField(type: FieldType, taken: Set<string>): FormField {
  const meta = FIELD_TYPE_META[type];
  const field: FormField = { id: uniqueId(type, taken), type, label: meta.label };
  if (meta.hasOptions) field.options = defaultOptions();
  if (meta.defaultSettings) field.settings = structuredClone(meta.defaultSettings);
  if (type === "radio_grid" || type === "checkbox_grid") {
    field.settings = {
      rows: [{ value: "r1", label: "שורה 1" }, { value: "r2", label: "שורה 2" }],
      columns: [{ value: "c1", label: "עמודה 1" }, { value: "c2", label: "עמודה 2" }],
    };
  }
  if (type === "repeating_table") field.fields = [{ id: "name", type: "short_text", label: "שם" }];
  if (type === "yes_no" || type === "heading" || type === "info_text" || type === "divider") field.width = "full";
  return field;
}

export function addField(def: FormDefinition, type: FieldType, at: Location): { def: FormDefinition; id: string } {
  const next = structuredClone(def);
  const field = newField(type, allIds(next));
  const page = next.pages[at.page]!;
  page.fields.splice(Math.min(at.index, page.fields.length), 0, field);
  return { def: next, id: field.id };
}

export function findLocation(def: FormDefinition, id: string): Location | null {
  for (let p = 0; p < def.pages.length; p++) {
    const index = def.pages[p]!.fields.findIndex((f) => f.id === id);
    if (index >= 0) return { page: p, index };
  }
  return null;
}

export function removeField(def: FormDefinition, id: string): FormDefinition {
  const next = structuredClone(def);
  for (const page of next.pages) page.fields = page.fields.filter((f) => f.id !== id);
  return next;
}

export function moveField(def: FormDefinition, id: string, to: Location): FormDefinition {
  const from = findLocation(def, id);
  if (!from) return def;
  const next = structuredClone(def);
  const [field] = next.pages[from.page]!.fields.splice(from.index, 1);
  const target = next.pages[to.page]!.fields;
  // Index was computed before removal; compensate when moving down within the same page.
  const idx = from.page === to.page && to.index > from.index ? to.index - 1 : to.index;
  target.splice(Math.max(0, Math.min(idx, target.length)), 0, field!);
  return next;
}

export function duplicateField(def: FormDefinition, id: string): { def: FormDefinition; id: string } {
  const loc = findLocation(def, id);
  if (!loc) return { def, id };
  const next = structuredClone(def);
  const copy = structuredClone(next.pages[loc.page]!.fields[loc.index]!);
  copy.id = uniqueId(copy.id, allIds(next));
  copy.label = `${copy.label} (עותק)`;
  next.pages[loc.page]!.fields.splice(loc.index + 1, 0, copy);
  return { def: next, id: copy.id };
}

export function updateField(def: FormDefinition, id: string, patch: Partial<FormField>): FormDefinition {
  const next = structuredClone(def);
  const loc = findLocation(next, id);
  if (!loc) return def;
  const field = next.pages[loc.page]!.fields[loc.index]!;
  Object.assign(field, patch);
  for (const k of Object.keys(patch) as (keyof FormField)[]) if (patch[k] === undefined) delete field[k];
  return next;
}

// ---------- Renaming ids keeps conditions pointing at the right field ----------

function renameInCondition(c: Condition | undefined, from: string, to: string): Condition | undefined {
  if (!c) return c;
  if ("all" in c) return { all: c.all.map((x) => renameInCondition(x, from, to)!) };
  if ("any" in c) return { any: c.any.map((x) => renameInCondition(x, from, to)!) };
  if ("not" in c) return { not: renameInCondition(c.not, from, to)! };
  return c.field === from ? { ...c, field: to } : c;
}

export function renameFieldId(def: FormDefinition, from: string, to: string): { def: FormDefinition; error?: string } {
  if (from === to) return { def };
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(to)) return { def, error: "מזהה: אותיות לועזיות, ספרות וקו תחתון, מתחיל באות" };
  if (allIds(def).has(to)) return { def, error: "מזהה זה כבר קיים בטופס" };
  const next = structuredClone(def);
  for (const page of next.pages) {
    page.visibleIf = renameInCondition(page.visibleIf, from, to);
    for (const f of page.fields) {
      if (f.id === from) f.id = to;
      f.visibleIf = renameInCondition(f.visibleIf, from, to);
      f.requiredIf = renameInCondition(f.requiredIf, from, to);
      if (!f.visibleIf) delete f.visibleIf;
      if (!f.requiredIf) delete f.requiredIf;
    }
    if (!page.visibleIf) delete page.visibleIf;
  }
  return { def: next };
}

// ---------- Pages ----------

export function addPage(def: FormDefinition): FormDefinition {
  const next = structuredClone(def);
  const taken = new Set(next.pages.map((p) => p.id));
  next.pages.push({ id: uniqueId("page", taken), title: `עמוד ${next.pages.length + 1}`, fields: [] });
  return next;
}

export function updatePage(def: FormDefinition, index: number, patch: Partial<FormPage>): FormDefinition {
  const next = structuredClone(def);
  Object.assign(next.pages[index]!, patch);
  return next;
}

/** Removes a page; its fields move to the previous page (or next, for the first). Never leaves zero pages. */
export function removePage(def: FormDefinition, index: number): FormDefinition {
  if (def.pages.length <= 1) return def;
  const next = structuredClone(def);
  const [removed] = next.pages.splice(index, 1);
  next.pages[Math.max(0, index - 1)]!.fields.push(...removed!.fields);
  return next;
}

export function movePage(def: FormDefinition, index: number, to: number): FormDefinition {
  if (to < 0 || to >= def.pages.length || index === to) return def;
  const next = structuredClone(def);
  const [page] = next.pages.splice(index, 1);
  next.pages.splice(to, 0, page!);
  return next;
}

// ---------- Options ----------

/** Parse pasted lines ("שורה לכל אפשרות") into options with stable generated values. */
export function parseOptionsText(text: string, existing: FieldOption[] = []): FieldOption[] {
  const byLabel = new Map(existing.map((o) => [o.label, o]));
  const used = new Set<string>();
  const out: FieldOption[] = [];
  let n = 0;
  for (const raw of text.split(/\r?\n/)) {
    const label = raw.trim();
    if (!label) continue;
    const keep = byLabel.get(label);
    let value = keep && !used.has(keep.value) ? keep.value : "";
    if (!value) {
      do value = `o${++n}`; while (used.has(value) || existing.some((o) => o.value === value && o.label !== label));
    }
    used.add(value);
    out.push(keep ? { ...keep, value } : { value, label });
  }
  return out;
}

// ---------- Publish checks ----------

export interface PublishIssue {
  message: string;
  fieldId?: string;
  page?: number;
}

export function publishIssues(def: FormDefinition): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const parsed = parseFormDefinition(def);
  if (!parsed.success) {
    for (const i of parsed.error.issues) issues.push({ message: `${i.path.join(".")}: ${i.message}` });
    return issues;
  }
  const ids = allIds(def);
  def.pages.forEach((page, p) => {
    if (page.fields.length === 0) issues.push({ message: `עמוד ריק: ${page.title || p + 1}`, page: p });
    for (const ref of conditionFieldRefs(page.visibleIf)) {
      if (!ids.has(ref)) issues.push({ message: `תנאי בעמוד "${page.title}" מפנה לשדה שלא קיים: ${ref}`, page: p });
    }
    for (const f of page.fields) {
      if (FIELD_TYPE_META[f.type].hasAnswer && !f.label.trim()) issues.push({ message: "שדה ללא תווית", fieldId: f.id, page: p });
      for (const cond of [f.visibleIf, f.requiredIf]) {
        for (const ref of conditionFieldRefs(cond)) {
          if (!ids.has(ref)) issues.push({ message: `תנאי בשדה "${f.label}" מפנה לשדה שלא קיים: ${ref}`, fieldId: f.id, page: p });
          if (ref === f.id) issues.push({ message: `שדה "${f.label}" תלוי בעצמו`, fieldId: f.id, page: p });
        }
      }
      if (FIELD_TYPE_META[f.type].hasOptions && !f.optionsSource && (f.options?.length ?? 0) < 1) {
        issues.push({ message: `לשדה "${f.label}" אין אפשרויות`, fieldId: f.id, page: p });
      }
      if ((f.type === "radio_grid" || f.type === "checkbox_grid") && (((f.settings?.rows as unknown[])?.length ?? 0) < 1 || ((f.settings?.columns as unknown[])?.length ?? 0) < 1)) {
        issues.push({ message: `ברשת "${f.label}" חסרות שורות או עמודות`, fieldId: f.id, page: p });
      }
    }
  });
  return issues;
}
