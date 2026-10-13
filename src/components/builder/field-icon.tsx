import { icons } from "lucide-react";
import { FIELD_TYPE_META, type FieldType } from "@/lib/forms/field-types";

export function FieldIcon({ type, className }: { type: FieldType; className?: string }) {
  const Icon = icons[FIELD_TYPE_META[type].icon as keyof typeof icons];
  return Icon ? <Icon className={className ?? "size-4"} aria-hidden="true" /> : null;
}
