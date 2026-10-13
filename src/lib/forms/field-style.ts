/** Per-field look (label / text block): size, weight, color, alignment, highlight. Semantic tokens + logical utilities only. */
import { z } from "zod";

export const fieldStyleSchema = z.object({
  size: z.enum(["sm", "md", "lg", "xl"]).optional(),
  bold: z.boolean().optional(),
  color: z.enum(["default", "muted", "primary", "destructive"]).optional(),
  align: z.enum(["start", "center", "end"]).optional(),
  highlight: z.boolean().optional(),
});
export type FieldStyle = z.infer<typeof fieldStyleSchema>;

const SIZE = { sm: "text-xs", md: "", lg: "text-lg", xl: "text-2xl" } as const;
const COLOR = { default: "", muted: "text-muted-foreground", primary: "text-primary", destructive: "text-destructive" } as const;
const ALIGN = { start: "", center: "text-center", end: "text-end" } as const;

export function fieldStyleClass(style: FieldStyle | undefined): string {
  if (!style) return "";
  return [
    style.size ? SIZE[style.size] : "",
    style.bold ? "font-bold" : "",
    style.color ? COLOR[style.color] : "",
    style.align === "start" ? "text-start" : style.align ? ALIGN[style.align] : "",
    style.highlight ? "rounded-md bg-accent px-3 py-2" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Removes default values so the stored definition stays minimal; undefined when nothing is customised. */
export function cleanStyle(style: FieldStyle): FieldStyle | undefined {
  const out: FieldStyle = {};
  if (style.size && style.size !== "md") out.size = style.size;
  if (style.bold) out.bold = true;
  if (style.color && style.color !== "default") out.color = style.color;
  if (style.align && style.align !== "start") out.align = style.align;
  if (style.highlight) out.highlight = true;
  return Object.keys(out).length ? out : undefined;
}

/** Choices shown in the builder's "עיצוב" section. */
export const FIELD_STYLE_OPTIONS = [
  { key: "size", label: "גודל", options: [{ value: "sm", label: "קטן" }, { value: "md", label: "רגיל" }, { value: "lg", label: "גדול" }, { value: "xl", label: "גדול מאוד" }] },
  { key: "color", label: "צבע", options: [{ value: "default", label: "רגיל" }, { value: "muted", label: "אפור" }, { value: "primary", label: "צבע הארגון" }, { value: "destructive", label: "אדום" }] },
  { key: "align", label: "יישור", options: [{ value: "start", label: "להתחלה" }, { value: "center", label: "מרכז" }, { value: "end", label: "לסוף" }] },
] as const;
