/** Turn stored answers into display strings (PDF stamping, dashboard, exports). */
import type { FormField } from "./schema";

export function formatDateIL(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function formatNumberIL(n: number, fractionDigits?: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits ?? 0,
    maximumFractionDigits: fractionDigits ?? 2,
  }).format(n);
}

function optionLabel(field: FormField, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

/**
 * Display string for a field value. For composite types pass `part`
 * (e.g. "bank", "city") to get one sub-value.
 */
export function formatAnswer(field: FormField, value: unknown, part?: string): string {
  if (value === undefined || value === null || value === "") return "";
  if (part && typeof value === "object" && !Array.isArray(value)) {
    const sub = (value as Record<string, unknown>)[part];
    return sub === undefined || sub === null ? "" : String(sub);
  }
  switch (field.type) {
    case "date":
      return formatDateIL(String(value));
    case "radio":
    case "dropdown":
      return optionLabel(field, String(value));
    case "checkboxes":
      return Array.isArray(value) ? value.map((v) => optionLabel(field, String(v))).join(", ") : String(value);
    case "yes_no":
      return value === "yes" ? "כן" : value === "no" ? "לא" : "";
    case "consent":
      return value === true ? "מאושר" : "";
    case "currency":
      return typeof value === "number" || !Number.isNaN(Number(value)) ? `₪${formatNumberIL(Number(value))}` : String(value);
    case "percent":
      return `${value}%`;
    case "number":
      return typeof value === "number" ? formatNumberIL(value) : String(value);
    case "bank_account": {
      const b = value as Record<string, string>;
      return [b.bank && `בנק ${b.bank}`, b.branch && `סניף ${b.branch}`, b.account && `חשבון ${b.account}`].filter(Boolean).join(", ");
    }
    case "address": {
      const a = value as Record<string, string>;
      const street = [a.street, a.house].filter(Boolean).join(" ");
      return [street, a.apartment && `דירה ${a.apartment}`, a.city, a.zip].filter(Boolean).join(", ");
    }
    case "signature":
    case "file_upload":
    case "repeating_table":
    case "radio_grid":
    case "checkbox_grid":
      return ""; // not representable as one string; stamped specially
    default:
      return String(value);
  }
}
