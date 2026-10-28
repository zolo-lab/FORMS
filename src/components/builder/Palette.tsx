"use client";
import { FIELD_TYPE_META, LAYOUT_TYPES, formFieldTypesByCategory, type FieldType } from "@/lib/forms/field-types";
import { FieldIcon } from "./field-icon";

export const DRAG_TYPE = "application/x-field-type";
export const DRAG_FIELD = "application/x-field-id";

export function Palette({ onAdd }: { onAdd: (type: FieldType) => void }) {
  // The same field types as the PDF tab; display blocks come last, under their own heading (they are not fields).
  const groups = [...formFieldTypesByCategory(), { category: "layout", label: "תצוגה (לא שדות, רק בטופס הרספונסיבי)", types: [...LAYOUT_TYPES] }];
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.category}>
          <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{g.label}</h3>
          <ul className="grid grid-cols-2 gap-1.5">
            {g.types.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, t); e.dataTransfer.effectAllowed = "copy"; }}
                  onClick={() => onAdd(t)}
                  className="flex w-full items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-start text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <FieldIcon type={t} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{FIELD_TYPE_META[t].label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
