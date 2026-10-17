/**
 * Optional second opinion on detected fields (`detect.ts`) from a language model: a cleaner label and a better
 * type for fields that are plain text. It sees names only (ids, labels, types, option names) and answers with ids;
 * places, pages and structure (choices, ID combs, signatures) are never its to change.
 */
import type { FieldType } from "@/lib/forms/field-types";
import type { DetectedField } from "./detect";

export const REFINABLE_TYPES = ["short_text", "long_text", "date", "phone", "email", "currency", "number", "id_number"] as const satisfies readonly FieldType[];
const REFINABLE = new Set<string>(REFINABLE_TYPES);

export interface Refinement { id: string; label?: string; type?: FieldType }

export const REFINE_TOOL = {
  name: "report_fields",
  description: "Report the cleaned label and best type for detected form fields.",
  input_schema: {
    type: "object",
    properties: {
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string", description: "The question as a short Hebrew field name, without numbering, colons or underscores" },
            type: { type: "string", enum: [...REFINABLE_TYPES] },
          },
          required: ["id"],
        },
      },
    },
    required: ["fields"],
  },
} as const;

type Named = Pick<DetectedField, "id" | "label" | "type"> & { options?: { label: string }[] };

export function refinePrompt(fields: Named[]): string {
  return [
    "A Hebrew PDF form was scanned for places to write. Each detected field below has the label found next to it, a guessed type and, for choices, the option names.",
    "Improve only the label (short, natural Hebrew, no numbering, colons or underscores) and, for plain text fields, the type. Leave a field out when it is already right.",
    `Allowed types: ${REFINABLE_TYPES.join(", ")}. Choice fields keep their type. Answer only by calling report_fields. Use the ids exactly as given.`,
    "",
    "FIELDS:",
    ...fields.map((f) => `- ${f.id} | ${f.type} | ${f.label}${f.options?.length ? ` | options: ${f.options.map((o) => o.label).join(", ")}` : ""}`),
  ].join("\n");
}

/** Keep only well-formed answers about known fields; types change only between plain-text types. */
export function sanitizeRefinements(raw: unknown, fields: Named[]): Refinement[] {
  const list = (raw as { fields?: unknown } | null)?.fields;
  if (!Array.isArray(list)) return [];
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: Refinement[] = [];
  const seen = new Set<string>();
  for (const item of list as Record<string, unknown>[]) {
    const id = typeof item?.id === "string" ? item.id : "";
    const original = byId.get(id);
    if (!original || seen.has(id)) continue;
    seen.add(id);
    const r: Refinement = { id };
    const label = typeof item.label === "string" ? item.label.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    if (label && label !== original.label) r.label = label;
    if (typeof item.type === "string" && REFINABLE.has(item.type) && REFINABLE.has(original.type) && item.type !== original.type) r.type = item.type as FieldType;
    if (r.label || r.type) out.push(r);
  }
  return out;
}

export function applyRefinements<T extends Pick<DetectedField, "id" | "label" | "type">>(fields: T[], refinements: Refinement[]): T[] {
  const byId = new Map(refinements.map((r) => [r.id, r]));
  return fields.map((f) => {
    const r = byId.get(f.id);
    return r ? { ...f, ...(r.label ? { label: r.label } : {}), ...(r.type ? { type: r.type } : {}) } : f;
  });
}
