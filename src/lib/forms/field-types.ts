/**
 * Registry of every field type the form builder supports.
 *
 * Categories:
 *  - "google":  parity with Google Forms question types
 *  - "israeli": Israeli-specific inputs (ת"ז, phone, bank, address)
 *  - "advanced": signature, repeating table, consent, hidden…
 *  - "layout":  display-only blocks (no answer)
 *
 * To add a type: add it to FIELD_TYPES, add metadata to FIELD_TYPE_META,
 * add its answer validation in validate.ts (the switch is exhaustive, so
 * TypeScript will tell you), then add renderer + builder-settings components.
 */

export const FIELD_TYPES = [
  // Google Forms parity
  "short_text",
  "long_text",
  "radio",
  "checkboxes",
  "dropdown",
  "file_upload",
  "linear_scale",
  "rating",
  "radio_grid",
  "checkbox_grid",
  "date",
  "time",
  // Common extras
  "number",
  "currency",
  "percent",
  "email",
  "yes_no",
  // Israeli
  "phone",
  "id_number",
  "bank_account",
  "full_name",
  "address",
  // Advanced
  "signature",
  "consent",
  "repeating_table",
  "grid",
  "hidden",
  // Layout (no answer)
  "heading",
  "info_text",
  "image",
  "divider",
  "section",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldCategory = "google" | "israeli" | "advanced" | "layout";

/** How a field can be stamped onto a PDF. */
export type PdfStampKind = "text" | "check" | "signature" | "image" | "none";

export interface FieldTypeMeta {
  label: string;
  category: FieldCategory;
  /** lucide-react icon name for the builder palette. */
  icon: string;
  /** False for layout blocks. */
  hasAnswer: boolean;
  /** Uses `options` / `optionsSource`. */
  hasOptions: boolean;
  /** Answer is an object with sub-parts that can be mapped to separate PDF boxes. */
  parts?: { key: string; label: string }[];
  pdf: PdfStampKind;
  /** Default `settings` when a new field of this type is added in the builder. */
  defaultSettings?: Record<string, unknown>;
}

export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  short_text: { label: "תשובה קצרה", category: "google", icon: "TextCursorInput", hasAnswer: true, hasOptions: false, pdf: "text" },
  long_text: { label: "פסקה", category: "google", icon: "AlignRight", hasAnswer: true, hasOptions: false, pdf: "text", defaultSettings: { rows: 4 } },
  radio: { label: "בחירה יחידה", category: "google", icon: "CircleDot", hasAnswer: true, hasOptions: true, pdf: "text" },
  checkboxes: { label: "תיבות סימון", category: "google", icon: "SquareCheck", hasAnswer: true, hasOptions: true, pdf: "check" },
  dropdown: { label: "רשימה נפתחת", category: "google", icon: "ChevronDown", hasAnswer: true, hasOptions: true, pdf: "text" },
  file_upload: { label: "העלאת קובץ", category: "google", icon: "Upload", hasAnswer: true, hasOptions: false, pdf: "none", defaultSettings: {}, },
  linear_scale: { label: "סולם ליניארי", category: "google", icon: "SlidersHorizontal", hasAnswer: true, hasOptions: false, pdf: "text", defaultSettings: { min: 1, max: 5, minLabel: "", maxLabel: "" } },
  rating: { label: "דירוג", category: "google", icon: "Star", hasAnswer: true, hasOptions: false, pdf: "text", defaultSettings: { max: 5 } },
  radio_grid: { label: "רשת בחירה יחידה", category: "google", icon: "Grid3x3", hasAnswer: true, hasOptions: false, pdf: "check", defaultSettings: { rows: [], columns: [] } },
  checkbox_grid: { label: "רשת תיבות סימון", category: "google", icon: "LayoutGrid", hasAnswer: true, hasOptions: false, pdf: "check", defaultSettings: { rows: [], columns: [] } },
  date: { label: "תאריך", category: "google", icon: "Calendar", hasAnswer: true, hasOptions: false, pdf: "text" },
  time: { label: "שעה", category: "google", icon: "Clock", hasAnswer: true, hasOptions: false, pdf: "text" },

  number: { label: "מספר", category: "google", icon: "Hash", hasAnswer: true, hasOptions: false, pdf: "text" },
  currency: { label: "סכום (₪)", category: "google", icon: "Banknote", hasAnswer: true, hasOptions: false, pdf: "text", defaultSettings: { currency: "ILS" } },
  percent: { label: "אחוז", category: "google", icon: "Percent", hasAnswer: true, hasOptions: false, pdf: "text" },
  email: { label: "דוא\"ל", category: "google", icon: "Mail", hasAnswer: true, hasOptions: false, pdf: "text" },
  yes_no: { label: "כן / לא", category: "google", icon: "ToggleRight", hasAnswer: true, hasOptions: false, pdf: "check" },

  phone: { label: "טלפון", category: "israeli", icon: "Phone", hasAnswer: true, hasOptions: false, pdf: "text" },
  id_number: { label: "תעודת זהות", category: "israeli", icon: "IdCard", hasAnswer: true, hasOptions: false, pdf: "text" },
  full_name: {
    label: "שם מלא", category: "israeli", icon: "User", hasAnswer: true, hasOptions: false, pdf: "text",
    parts: [
      { key: "first", label: "שם פרטי" },
      { key: "last", label: "שם משפחה" },
    ],
  },
  bank_account: {
    label: "חשבון בנק", category: "israeli", icon: "Landmark", hasAnswer: true, hasOptions: false, pdf: "text",
    parts: [
      { key: "bank", label: "בנק" },
      { key: "branch", label: "סניף" },
      { key: "account", label: "מספר חשבון" },
    ],
  },
  address: {
    label: "כתובת", category: "israeli", icon: "MapPin", hasAnswer: true, hasOptions: false, pdf: "text",
    parts: [
      { key: "city", label: "יישוב" },
      { key: "street", label: "רחוב" },
      { key: "house", label: "מספר בית" },
      { key: "apartment", label: "דירה" },
      { key: "zip", label: "מיקוד" },
    ],
  },

  signature: { label: "חתימה", category: "advanced", icon: "Signature", hasAnswer: true, hasOptions: false, pdf: "signature" },
  consent: { label: "הצהרה / אישור", category: "advanced", icon: "BadgeCheck", hasAnswer: true, hasOptions: false, pdf: "check" },
  repeating_table: { label: "טבלה חוזרת", category: "advanced", icon: "Table", hasAnswer: true, hasOptions: false, pdf: "text", defaultSettings: { minRows: 0, maxRows: 20, addLabel: "הוספת שורה" } },
  grid: {
    label: "טבלה קבועה", category: "advanced", icon: "Table", hasAnswer: true, hasOptions: false, pdf: "none",
    defaultSettings: { rows: [{ value: "r1", label: "שורה 1" }, { value: "r2", label: "שורה 2" }], columns: [{ value: "c1", label: "עמודה 1", type: "text" }, { value: "c2", label: "עמודה 2", type: "number" }] },
  },
  hidden: { label: "שדה מוסתר", category: "advanced", icon: "EyeOff", hasAnswer: true, hasOptions: false, pdf: "text" },

  heading: { label: "כותרת", category: "layout", icon: "Heading", hasAnswer: false, hasOptions: false, pdf: "none" },
  info_text: { label: "טקסט הסבר", category: "layout", icon: "Info", hasAnswer: false, hasOptions: false, pdf: "none" },
  image: { label: "תמונה", category: "layout", icon: "Image", hasAnswer: false, hasOptions: false, pdf: "none", defaultSettings: { src: "", alt: "" } },
  section: { label: "מקטע", category: "layout", icon: "PanelTop", hasAnswer: false, hasOptions: false, pdf: "none" },
  divider: { label: "קו מפריד", category: "layout", icon: "Minus", hasAnswer: false, hasOptions: false, pdf: "none" },
};

export const FIELD_CATEGORY_LABELS: Record<FieldCategory, string> = {
  google: "שאלות",
  israeli: "פרטים ישראליים",
  advanced: "מתקדם",
  layout: "עיצוב ותוכן",
};

export function fieldTypesByCategory(): Record<FieldCategory, FieldType[]> {
  const out: Record<FieldCategory, FieldType[]> = { google: [], israeli: [], advanced: [], layout: [] };
  for (const t of FIELD_TYPES) out[FIELD_TYPE_META[t].category].push(t);
  return out;
}
