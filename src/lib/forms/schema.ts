/**
 * Form definition schema — the single source of truth for every form in the
 * system (Form 101, employment request, contract acknowledgement, bank details…).
 *
 * A form definition is pure JSON, stored versioned in the DB
 * (form_template_versions.definition). The builder UI edits it, the renderer
 * displays it, validate.ts checks answers against it, and PDF templates map
 * its fields onto uploaded PDF pages (see pdf-mapping.ts).
 *
 * Never break backwards compatibility of this schema without a migration:
 * signed submissions reference the exact version they were filled against.
 */
import { fieldStyleSchema, type FieldStyle } from "./field-style";
import { z } from "zod";
import { FIELD_TYPES, type FieldType } from "./field-types";

// ---------- Conditions (show/hide, required-if) ----------

export const comparisonOps = [
  "eq", "neq", "in", "notIn", "gt", "gte", "lt", "lte",
  "empty", "notEmpty", "contains", "notContains",
] as const;
export type ComparisonOp = (typeof comparisonOps)[number];

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: string; op: ComparisonOp; value?: unknown };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionSchema) }),
    z.object({ any: z.array(conditionSchema) }),
    z.object({ not: conditionSchema }),
    z.object({ field: z.string().min(1), op: z.enum(comparisonOps), value: z.unknown().optional() }),
  ]),
);

// ---------- Field ----------

/** Who fills a field in the signing chain. */
export const fillerRoles = ["requester", "employee", "approver", "payroll", "hr"] as const;
export type FillerRole = (typeof fillerRoles)[number];

export const optionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  /** Payroll/Priority export code, if different from value. */
  code: z.string().optional(),
});
export type FieldOption = z.infer<typeof optionSchema>;

export const validationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().optional(),
    pattern: z.string().optional(),
    patternMessage: z.string().optional(),
    /** Text fields: allowed characters ("ספרות בלבד" / "עברית בלבד" / "אנגלית בלבד" in iForms). */
    charset: z.enum(["digits", "hebrew", "english"]).optional(),
    /** For checkbox/multi-select: min/max selected items. */
    minSelected: z.number().int().nonnegative().optional(),
    maxSelected: z.number().int().positive().optional(),
    /** For file upload. */
    maxFiles: z.number().int().positive().optional(),
    maxSizeMb: z.number().positive().optional(),
    accept: z.array(z.string()).optional(),
    /** For dates: ISO yyyy-mm-dd, or "today". */
    minDate: z.string().optional(),
    maxDate: z.string().optional(),
  })
  .partial();
export type FieldValidation = z.infer<typeof validationSchema>;

const fieldIdSchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "מזהה שדה: אותיות לועזיות, ספרות וקו תחתון, מתחיל באות");

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  requiredIf?: Condition;
  visibleIf?: Condition;
  /** Locked (read-only, not validated, value dropped) while this condition holds. */
  disabledIf?: Condition;
  readOnly?: boolean;
  defaultValue?: unknown;
  /** Pre-fill from request/employee data, e.g. "employee.firstName". */
  prefill?: string;
  /** Which role in the signing chain fills this field. Default: employee. */
  filledBy?: FillerRole;
  /**
   * Staff only (e.g. cost centre): filled by the requester (or the API), never shown to any other step, never drawn on
   * the PDF or put in e-mails; kept in the data, the export and the staff views. See src/lib/forms/internal.ts.
   */
  internal?: boolean;
  options?: FieldOption[];
  /** Option source instead of static options: "banks", "branches", "cities", "streets", "costCenters:1|2|3", "organizations". */
  optionsSource?: string;
  /** Allow free-text "other" option (choice fields). */
  allowOther?: boolean;
  validation?: FieldValidation;
  /** Type-specific settings (scale range, grid rows/columns, currency, etc.). */
  settings?: Record<string, unknown>;
  /** For repeating_table / group: nested fields. */
  fields?: FormField[];
  /** Export key for Priority/CSV. Defaults to id. */
  exportKey?: string;
  /** Computed field: see formula.ts. The value is recalculated on the server and the field is read-only for the filler. */
  formula?: string;
  /** Input mask for short_text, e.g. "999-9999999". See mask.ts. */
  mask?: string;
  /** No other request of the same templates may hold the same value (checked on the server at submit). */
  unique?: boolean;
  /** Layout width hint on desktop. */
  width?: "full" | "half" | "third";
  /** Look of the label / text block (size, weight, color, alignment, highlight). */
  style?: FieldStyle;
}

export const fieldSchema: z.ZodType<FormField> = z.lazy(() =>
  z.object({
    id: fieldIdSchema,
    type: z.enum(FIELD_TYPES),
    label: z.string(),
    description: z.string().optional(),
    placeholder: z.string().optional(),
    required: z.boolean().optional(),
    requiredIf: conditionSchema.optional(),
    visibleIf: conditionSchema.optional(),
    disabledIf: conditionSchema.optional(),
    readOnly: z.boolean().optional(),
    defaultValue: z.unknown().optional(),
    prefill: z.string().optional(),
    filledBy: z.enum(fillerRoles).optional(),
    internal: z.boolean().optional(),
    options: z.array(optionSchema).optional(),
    optionsSource: z.string().optional(),
    allowOther: z.boolean().optional(),
    validation: validationSchema.optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    fields: z.array(fieldSchema).optional(),
    exportKey: z.string().optional(),
    formula: z.string().optional(),
    mask: z.string().max(60).optional(),
    unique: z.boolean().optional(),
    width: z.enum(["full", "half", "third"]).optional(),
    style: fieldStyleSchema.optional(),
  }),
);

// ---------- Page / Form ----------

/** Wizard jump: when `if` holds, the page after this one is `goTo` (a page id, or "end" to finish). First match wins. */
export const pageJumpSchema = z.object({ if: conditionSchema, goTo: z.string().min(1) });
export type PageJump = z.infer<typeof pageJumpSchema>;

export const pageSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().optional(),
  visibleIf: conditionSchema.optional(),
  nextPage: z.array(pageJumpSchema).optional(),
  fields: z.array(fieldSchema),
});
export type FormPage = z.infer<typeof pageSchema>;

export const formDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1),
    description: z.string().optional(),
    pages: z.array(pageSchema).min(1),
    settings: z
      .object({
        /** wizard: one page at a time · single: everything on one page · card: one question per screen with a review at the end. */
        layout: z.enum(["wizard", "single", "card"]).default("wizard"),
        submitLabel: z.string().optional(),
        /** Text shown after submit. */
        thankYou: z.string().optional(),
      })
      .partial()
      .optional(),
  })
  .superRefine((form, ctx) => {
    // Field ids must be unique across the whole form (nested table columns are scoped to their table).
    const seen = new Set<string>();
    form.pages.forEach((page, p) =>
      page.fields.forEach((field, f) => {
        if (seen.has(field.id)) {
          ctx.addIssue({
            code: "custom",
            message: `מזהה שדה כפול: ${field.id}`,
            path: ["pages", p, "fields", f, "id"],
          });
        }
        seen.add(field.id);
      }),
    );
  });
export type FormDefinition = z.infer<typeof formDefinitionSchema>;

/** All top-level fields of a form, in order. */
export function allFields(form: FormDefinition): FormField[] {
  return form.pages.flatMap((p) => p.fields);
}

export function findField(form: FormDefinition, id: string): FormField | undefined {
  return allFields(form).find((f) => f.id === id);
}

/** Old forms marked drawn fields with `settings.pdfOnly`; that flag means nothing now, so it is dropped on load. */
export function stripLegacyPdfOnly(def: FormDefinition): FormDefinition {
  let changed = false;
  const strip = (f: FormField): FormField => {
    const fields = f.fields?.map(strip);
    const hasFlag = !!f.settings && "pdfOnly" in f.settings;
    if (!hasFlag && (!fields || fields.every((c, i) => c === f.fields![i]))) return f;
    changed = true;
    const { pdfOnly: _flag, ...rest } = f.settings ?? {};
    void _flag;
    return { ...f, ...(fields ? { fields } : {}), ...(hasFlag ? (Object.keys(rest).length ? { settings: rest } : { settings: undefined }) : {}) };
  };
  const pages = def.pages.map((p) => {
    const fields = p.fields.map(strip);
    return fields.every((f, i) => f === p.fields[i]) ? p : { ...p, fields };
  });
  return changed ? { ...def, pages } : def;
}

/** Parse + validate an unknown JSON blob as a form definition. */
export function parseFormDefinition(input: unknown) {
  const r = formDefinitionSchema.safeParse(input);
  return r.success ? { ...r, data: stripLegacyPdfOnly(r.data) } : r;
}
