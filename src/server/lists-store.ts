/**
 * Linked lists: list types (a named set of fields), the lists of each type, and their values. One shape for every
 * type – the organizations included, as a built-in type read from and written to `organizations` – so the screen
 * and, later, the form bindings never need to know which is which.
 */
import { and, asc, count, eq, max, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { suggestKey } from "@/lib/fields/key";
import { isOrgFieldType } from "@/lib/fields/types";
import { cleanCell, cleanOptions, isListFieldKind, listTitle, type CellValue, type ListFieldKind } from "@/lib/lists/kinds";
import { parseOrgInput } from "@/lib/orgs/input";
import { createOrg, createOrgFieldDef, deleteOrgFieldDef, listOrgFieldDefs, listOrgs, takenFieldKeys, updateOrgBasics, updateOrgFieldDef } from "./orgs-store";

const { listTypes, listTypeFields, listRecords, organizations } = schema;

/** The id of the built-in organizations type. It has no row in `list_types`. */
export const ORG_TYPE = "org";
const NAME = "__name";
const REG = "__reg";

export interface TypeSummary {
  id: string;
  name: string;
  count: number;
  builtin: boolean;
}
export interface SheetField {
  id: string;
  key: string;
  label: string;
  kind: ListFieldKind;
  options: string[];
  multi: boolean;
  parentTypeId: string | null;
  /** The organizations' name and registration number: always there, cannot be removed or renamed. */
  fixed?: boolean;
}
export interface SheetRow {
  id: string;
  values: Record<string, CellValue>;
}
export interface Sheet {
  type: TypeSummary;
  fields: SheetField[];
  rows: SheetRow[];
  /** For every "belongs to" field: the lists it may point at, by parent type. */
  refs: Record<string, { id: string; title: string }[]>;
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// ───────────────────────────── types ─────────────────────────────

export async function listTypeSummaries(): Promise<TypeSummary[]> {
  const [types, counts, orgCount] = await Promise.all([
    db.select().from(listTypes).orderBy(asc(listTypes.order), asc(listTypes.name)),
    db.select({ id: listRecords.listTypeId, n: count() }).from(listRecords).groupBy(listRecords.listTypeId),
    db.select({ n: count() }).from(organizations),
  ]);
  const byType = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return [
    { id: ORG_TYPE, name: "עמותות ועסקים", count: Number(orgCount[0]?.n ?? 0), builtin: true },
    ...types.map((t) => ({ id: t.id, name: t.name, count: byType.get(t.id) ?? 0, builtin: false })),
  ];
}

const cleanName = (raw: string) => raw.replace(/\s+/g, " ").trim().slice(0, 80);

export async function createListType(name: string, firstFields: { label: string; kind: string }[] = []): Promise<Result<{ id: string }>> {
  const n = cleanName(name);
  if (!n) return fail("צריך שם לסוג הרשימה");
  const [{ m } = { m: 0 }] = await db.select({ m: max(listTypes.order) }).from(listTypes);
  const [row] = await db.insert(listTypes).values({ name: n, order: Number(m ?? 0) + 1 }).returning({ id: listTypes.id });
  for (const f of firstFields) if (f.label.trim()) await addField(row!.id, { label: f.label, kind: f.kind });
  return { ok: true, id: row!.id };
}

export async function renameListType(id: string, name: string): Promise<Result> {
  const n = cleanName(name);
  if (!n) return fail("צריך שם לסוג הרשימה");
  if (id === ORG_TYPE) return fail("את סוג העמותות אי אפשר לשנות");
  await db.update(listTypes).set({ name: n, updatedAt: new Date() }).where(eq(listTypes.id, id));
  return { ok: true };
}

/** How many lists a deletion would drop, and which other types point at this one. */
export async function listTypeUsage(id: string): Promise<{ lists: number; pointedBy: string[] }> {
  const [[c], parents] = await Promise.all([
    db.select({ n: count() }).from(listRecords).where(eq(listRecords.listTypeId, id)),
    db
      .selectDistinct({ name: listTypes.name })
      .from(listTypeFields)
      .innerJoin(listTypes, eq(listTypes.id, listTypeFields.listTypeId))
      .where(eq(listTypeFields.parentTypeId, id)),
  ]);
  return { lists: Number(c?.n ?? 0), pointedBy: parents.map((p) => p.name) };
}

export async function deleteListType(id: string): Promise<Result> {
  if (id === ORG_TYPE) return fail("את סוג העמותות אי אפשר למחוק");
  // Checked here too, not only on screen: a "belongs to" field left without its type could never be filled again.
  const { pointedBy } = await listTypeUsage(id);
  if (pointedBy.length) return fail(`אי אפשר למחוק: ${pointedBy.join(", ")} משויכים לסוג הזה`);
  await db.delete(listTypes).where(eq(listTypes.id, id));
  return { ok: true };
}

// ───────────────────────────── the sheet ─────────────────────────────

const toField = (f: typeof listTypeFields.$inferSelect): SheetField => ({
  id: f.id,
  key: f.key,
  label: f.label,
  kind: isListFieldKind(f.kind) ? f.kind : "short_text",
  options: f.options ?? [],
  multi: f.multi,
  parentTypeId: f.parentTypeId,
});

async function fieldsOf(typeId: string): Promise<SheetField[]> {
  if (typeId === ORG_TYPE) {
    const defs = await listOrgFieldDefs();
    return [
      { id: "org:name", key: NAME, label: "שם", kind: "short_text", options: [], multi: false, parentTypeId: null, fixed: true },
      { id: "org:reg", key: REG, label: 'ח"פ', kind: "id_number", options: [], multi: false, parentTypeId: null, fixed: true },
      ...defs.map((d) => ({ id: d.id, key: d.key, label: d.label, kind: (isListFieldKind(d.type) ? d.type : "short_text") as ListFieldKind, options: [], multi: false, parentTypeId: null })),
    ];
  }
  const rows = await db.select().from(listTypeFields).where(eq(listTypeFields.listTypeId, typeId)).orderBy(asc(listTypeFields.order), asc(listTypeFields.createdAt));
  return rows.map(toField);
}

/** The lists of a type as `{ id, title }`, for a "belongs to" dropdown. */
async function titlesOf(typeId: string): Promise<{ id: string; title: string }[]> {
  if (typeId === ORG_TYPE) return (await listOrgs()).map((o) => ({ id: o.id, title: o.name }));
  const [fields, rows] = await Promise.all([
    fieldsOf(typeId),
    db.select().from(listRecords).where(eq(listRecords.listTypeId, typeId)).orderBy(asc(listRecords.order), asc(listRecords.createdAt)),
  ]);
  return rows.map((r) => ({ id: r.id, title: listTitle(r.values, fields) }));
}

export async function loadSheet(typeId: string): Promise<Sheet | null> {
  const summary = (await listTypeSummaries()).find((t) => t.id === typeId);
  if (!summary) return null;
  const fields = await fieldsOf(typeId);
  let rows: SheetRow[];
  if (typeId === ORG_TYPE) {
    rows = (await listOrgs()).map((o) => ({ id: o.id, values: { ...(o.fieldValues ?? {}), [NAME]: o.name, [REG]: o.registrationNumber } }));
  } else {
    const r = await db.select().from(listRecords).where(eq(listRecords.listTypeId, typeId)).orderBy(asc(listRecords.order), asc(listRecords.createdAt));
    rows = r.map((x) => ({ id: x.id, values: x.values }));
  }
  const refs: Sheet["refs"] = {};
  for (const f of fields) if (f.kind === "ref" && f.parentTypeId && !refs[f.parentTypeId]) refs[f.parentTypeId] = await titlesOf(f.parentTypeId);
  return { type: summary, fields, rows, refs };
}

// ───────────────────────────── fields ─────────────────────────────

export interface FieldInput {
  label: string;
  kind: string;
  options?: unknown;
  multi?: boolean;
  parentTypeId?: string | null;
}

/** A new field for every list of the type. People give a Hebrew name; the internal name is made from it. */
export async function addField(typeId: string, input: FieldInput): Promise<Result<{ key: string }>> {
  const label = cleanName(input.label);
  if (!label) return fail("צריך שם לשדה");
  if (!isListFieldKind(input.kind)) return fail("סוג שדה לא מוכר");
  if (typeId === ORG_TYPE) {
    if (!isOrgFieldType(input.kind)) return fail("לעמותות אפשר להוסיף כרגע רק שדות של שורה אחת");
    const r = await createOrgFieldDef({ label, type: input.kind });
    return r.ok ? { ok: true, key: r.key } : fail(r.reason === "exists" ? "כבר יש שדה בשם הזה" : "השדה לא נוסף");
  }
  const options = cleanOptions(input.options);
  if (input.kind === "select" && options.length === 0) return fail("שדה בחירה צריך לפחות אפשרות אחת");
  let parentTypeId: string | null = null;
  if (input.kind === "ref") {
    parentTypeId = input.parentTypeId ?? null;
    if (!parentTypeId || parentTypeId === typeId) return fail('צריך לבחור לאיזה סוג השדה "שייך"');
    if (parentTypeId !== ORG_TYPE) {
      const [p] = await db.select({ id: listTypes.id }).from(listTypes).where(eq(listTypes.id, parentTypeId));
      if (!p) return fail("סוג הרשימה שנבחר לא קיים");
    } else return fail("שיוך לעמותות יגיע בשלב הבא");
  }
  const existing = await db.select({ key: listTypeFields.key }).from(listTypeFields).where(eq(listTypeFields.listTypeId, typeId));
  const key = suggestKey(label, existing.map((e) => e.key));
  const [{ m } = { m: 0 }] = await db.select({ m: max(listTypeFields.order) }).from(listTypeFields).where(eq(listTypeFields.listTypeId, typeId));
  await db.insert(listTypeFields).values({
    listTypeId: typeId,
    key,
    label,
    kind: input.kind,
    options: input.kind === "select" ? options : [],
    multi: input.kind === "select" && input.multi === true,
    parentTypeId,
    order: Number(m ?? 0) + 1,
  });
  return { ok: true, key };
}

/** The name, the options (for a choice) or one/several of a field. The internal name and the kind stay. */
export async function updateField(typeId: string, fieldId: string, patch: { label?: string; options?: unknown; multi?: boolean }): Promise<Result> {
  if (fieldId.startsWith("org:")) return fail("את השם והח\"פ אי אפשר לשנות");
  if (typeId === ORG_TYPE) {
    const label = patch.label !== undefined ? cleanName(patch.label) : undefined;
    if (patch.label !== undefined && !label) return fail("צריך שם לשדה");
    const r = await updateOrgFieldDef(fieldId, { label });
    return r.ok ? { ok: true } : fail("השדה לא עודכן");
  }
  const [f] = await db.select().from(listTypeFields).where(and(eq(listTypeFields.id, fieldId), eq(listTypeFields.listTypeId, typeId)));
  if (!f) return fail("השדה לא נמצא");
  const set: Partial<typeof listTypeFields.$inferInsert> = { updatedAt: new Date() };
  if (patch.label !== undefined) {
    const label = cleanName(patch.label);
    if (!label) return fail("צריך שם לשדה");
    set.label = label;
  }
  if (patch.options !== undefined && f.kind === "select") {
    const options = cleanOptions(patch.options);
    if (!options.length) return fail("שדה בחירה צריך לפחות אפשרות אחת");
    set.options = options;
  }
  if (patch.multi !== undefined && f.kind === "select") set.multi = patch.multi;
  await db.update(listTypeFields).set(set).where(eq(listTypeFields.id, fieldId));
  return { ok: true };
}

/** How many lists filled the field in: shown before a deletion. */
export async function fieldUsage(typeId: string, key: string): Promise<{ filled: number }> {
  if (typeId === ORG_TYPE) {
    const [r] = await db.select({ n: count() }).from(organizations).where(sql`${organizations.fieldValues} ? ${key} AND ${organizations.fieldValues} ->> ${key} <> ''`);
    return { filled: Number(r?.n ?? 0) };
  }
  const [r] = await db
    .select({ n: count() })
    .from(listRecords)
    .where(and(eq(listRecords.listTypeId, typeId), sql`${listRecords.values} ? ${key} AND ${listRecords.values} -> ${key} NOT IN ('""'::jsonb, '[]'::jsonb)`));
  return { filled: Number(r?.n ?? 0) };
}

/** Drops a field from the type and its value from every list (values first: no transactions over neon-http). */
export async function deleteField(typeId: string, fieldId: string): Promise<Result> {
  if (fieldId.startsWith("org:")) return fail("את השם והח\"פ אי אפשר למחוק");
  if (typeId === ORG_TYPE) {
    await deleteOrgFieldDef(fieldId);
    return { ok: true };
  }
  const [f] = await db.select().from(listTypeFields).where(and(eq(listTypeFields.id, fieldId), eq(listTypeFields.listTypeId, typeId)));
  if (!f) return fail("השדה לא נמצא");
  await db.update(listRecords).set({ values: sql`${listRecords.values} - ${f.key}` }).where(eq(listRecords.listTypeId, f.listTypeId));
  await db.delete(listTypeFields).where(eq(listTypeFields.id, fieldId));
  return { ok: true };
}

// ───────────────────────────── lists (rows) ─────────────────────────────

/** A new, empty list of the type. Organizations are created with their name and number in one go. */
export async function addList(typeId: string, org?: { name: string; registrationNumber: string }): Promise<Result<{ id: string }>> {
  if (typeId === ORG_TYPE) {
    const parsed = parseOrgInput(org ?? {});
    if (!parsed.ok) return fail(parsed.error === "regnum" ? 'ח"פ: 9 ספרות' : "צריך שם לעמותה");
    const r = await createOrg(parsed.value);
    return r ? { ok: true, id: r.id } : fail('כבר יש עמותה עם הח"פ הזה');
  }
  const [t] = await db.select({ id: listTypes.id }).from(listTypes).where(eq(listTypes.id, typeId));
  if (!t) return fail("סוג הרשימה לא נמצא");
  const [{ m } = { m: 0 }] = await db.select({ m: max(listRecords.order) }).from(listRecords).where(eq(listRecords.listTypeId, typeId));
  const [row] = await db.insert(listRecords).values({ listTypeId: typeId, values: {}, order: Number(m ?? 0) + 1 }).returning({ id: listRecords.id });
  return { ok: true, id: row!.id };
}

export async function deleteList(typeId: string, id: string): Promise<Result> {
  if (typeId === ORG_TYPE) return fail("עמותה מכבים במסך העמותות");
  await db.delete(listRecords).where(and(eq(listRecords.id, id), eq(listRecords.listTypeId, typeId)));
  return { ok: true };
}

/** One cell, checked against its field. Empty clears it. */
export async function setCell(typeId: string, listId: string, key: string, raw: unknown): Promise<Result> {
  const fields = await fieldsOf(typeId);
  const field = fields.find((f) => f.key === key);
  if (!field) return fail("השדה לא נמצא");

  if (typeId === ORG_TYPE) {
    const [o] = await db.select().from(organizations).where(eq(organizations.id, listId));
    if (!o) return fail("העמותה לא נמצאה");
    if (key === NAME || key === REG) {
      const parsed = parseOrgInput({ name: key === NAME ? raw : o.name, registrationNumber: key === REG ? raw : o.registrationNumber });
      if (!parsed.ok) return fail(parsed.error === "regnum" ? 'ח"פ: 9 ספרות' : "צריך שם לעמותה");
      return (await updateOrgBasics(listId, parsed.value)) ? { ok: true } : fail('כבר יש עמותה עם הח"פ הזה');
    }
    const c = cleanCell(field, raw);
    if (!c.ok) return fail(c.error);
    const v = typeof c.value === "string" ? c.value : c.value.join(", ");
    await db
      .update(organizations)
      .set({ fieldValues: v ? sql`${organizations.fieldValues} || jsonb_build_object(${key}::text, ${v}::text)` : sql`${organizations.fieldValues} - ${key}` })
      .where(eq(organizations.id, listId));
    return { ok: true };
  }

  const refIds = field.kind === "ref" && field.parentTypeId ? new Set((await titlesOf(field.parentTypeId)).map((t) => t.id)) : undefined;
  const c = cleanCell(field, raw, refIds);
  if (!c.ok) return fail(c.error);
  const empty = Array.isArray(c.value) ? c.value.length === 0 : !c.value;
  const res = await db
    .update(listRecords)
    .set({
      values: empty ? sql`${listRecords.values} - ${key}` : sql`${listRecords.values} || jsonb_build_object(${key}::text, ${JSON.stringify(c.value)}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(and(eq(listRecords.id, listId), eq(listRecords.listTypeId, typeId)))
    .returning({ id: listRecords.id });
  return res.length ? { ok: true } : fail("הרשימה לא נמצאה");
}

/** Every internal key any list type uses, so nothing else picks one of them. */
export async function allListKeys(): Promise<Set<string>> {
  const [orgKeys, rows] = await Promise.all([takenFieldKeys(), db.select({ key: listTypeFields.key }).from(listTypeFields)]);
  return new Set([...orgKeys, ...rows.map((r) => r.key)]);
}

