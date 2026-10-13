"use client";
import { useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Answers } from "@/lib/forms/conditions";
import type { FormField } from "@/lib/forms/schema";
import type { FieldProps } from "./types";

export type RenderChild = (child: FormField, row: Answers, onRow: (id: string, v: unknown) => void, prefix: string, parentDisabled: boolean) => React.ReactNode;

/** Repeating table: one card per row (works the same on mobile and desktop). */
export function RepeatingTableInput({
  field, domId, value, onChange, disabled, renderChild,
}: FieldProps & { renderChild: RenderChild }) {
  const rows = Array.isArray(value) ? (value as Answers[]) : [];
  const s = field.settings ?? {};
  const minRows = Number(s.minRows ?? 0);
  const maxRows = s.maxRows !== undefined ? Number(s.maxRows) : Infinity;

  useEffect(() => {
    if (!disabled && rows.length === 0 && minRows > 0) onChange(Array.from({ length: minRows }, () => ({})));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed the minimum rows once
  }, []);

  const setCell = (i: number, id: string, v: unknown) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, [id]: v } : r)));

  return (
    <div id={domId} className="space-y-3">
      {rows.map((row, i) => (
        <Card key={i} className="space-y-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">{field.label} {i + 1}</span>
            {!disabled && rows.length > minRows && (
              <Button variant="ghost" size="sm" aria-label={`מחיקת שורה ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            {(field.fields ?? []).map((child) => renderChild(child, row, (id, v) => setCell(i, id, v), `${field.id}.${i}.`, disabled))}
          </div>
        </Card>
      ))}
      {!disabled && rows.length < maxRows && (
        <Button variant="outline" onClick={() => onChange([...rows, {}])}>
          <Plus className="size-4" />
          {String(s.addLabel ?? "הוספת שורה")}
        </Button>
      )}
    </div>
  );
}
