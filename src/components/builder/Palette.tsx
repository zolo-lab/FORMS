"use client";
import { FIELD_CATEGORY_LABELS, FIELD_TYPE_META, fieldTypesByCategory, type FieldType } from "@/lib/forms/field-types";
import { FieldIcon } from "./field-icon";

export const DRAG_TYPE = "application/x-field-type";
export const DRAG_FIELD = "application/x-field-id";

export function Palette({ onAdd }: { onAdd: (type: FieldType) => void }) {
  const groups = fieldTypesByCategory();
  return (
    <div className="space-y-4">
      {(Object.keys(groups) as (keyof typeof groups)[]).map((cat) => (
        <section key={cat}>
          <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{FIELD_CATEGORY_LABELS[cat]}</h3>
          <ul className="grid grid-cols-2 gap-1.5">
            {groups[cat].map((t) => (
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
