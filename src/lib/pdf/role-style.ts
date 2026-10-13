import type { FillerRole } from "@/lib/forms/schema";

/** Overlay colours per signing role in the PDF designer (semantic tokens; class names must stay literal for Tailwind). */
export const ROLE_OVERLAY: Record<FillerRole | "none", { box: string; boxActive: string; dot: string }> = {
  none: { box: "border-primary/60 bg-primary/10", boxActive: "border-primary bg-primary/25", dot: "bg-primary" },
  requester: { box: "border-primary/60 bg-primary/10", boxActive: "border-primary bg-primary/25", dot: "bg-primary" },
  employee: { box: "border-success/60 bg-success/10", boxActive: "border-success bg-success/25", dot: "bg-success" },
  approver: { box: "border-warning/60 bg-warning/10", boxActive: "border-warning bg-warning/25", dot: "bg-warning" },
  payroll: { box: "border-destructive/60 bg-destructive/10", boxActive: "border-destructive bg-destructive/25", dot: "bg-destructive" },
  hr: { box: "border-accent-foreground/60 bg-accent-foreground/10", boxActive: "border-accent-foreground bg-accent-foreground/25", dot: "bg-accent-foreground" },
};

/** Field id of a stamp's target, ignoring table-cell suffixes ("children[0].name" → "children"). */
export function baseFieldId(fieldId: string): string {
  return fieldId.replace(/\[\d+\]\..*$/, "");
}
