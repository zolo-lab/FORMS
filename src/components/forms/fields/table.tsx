"use client";
import { useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Answers } from "@/lib/forms/conditions";
import type { FormField } from "@/lib/forms/schema";
import type { FieldProps } from "./types";

export type RenderChild = (child: FormField, row: Answers, onRow: (id: string, v: unknown) => void, prefix: string, parentDisabled: boolean) => React.ReactNode;

/** Repeating table: a real table (column titles once, a line per row) from the sm breakpoint, one card per row on a phone. */
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

  const cols = field.fields ?? [];
  // Column titles once on top (sm+); each cell keeps its label for screen readers (sr-only) and for the phone cards.
  const template = { "--cols": `repeat(${Math.max(1, cols.length)}, minmax(0, 1fr)) 2.75rem` } as React.CSSProperties;
  return (
    <div id={domId} className="space-y-3 sm:space-y-0" style={template}>
      {rows.length > 0 && (
        <div aria-hidden="true" className="hidden gap-3 border-b px-1 pb-2 text-xs font-medium text-muted-foreground sm:grid sm:[grid-template-columns:var(--cols)]">
          {cols.map((c) => <span key={c.id}>{c.label}</span>)}
          <span />
        </div>
      )}
      {rows.map((row, i) => (
        <Card key={i} className="space-y-3 p-3 sm:space-y-0 sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:px-1 sm:py-2 sm:shadow-none">
          <div className="flex items-center justify-between sm:hidden">
            <span className="text-sm font-medium text-muted-foreground">{field.label} {i + 1}</span>
            {!disabled && rows.length > minRows && (
              <Button variant="ghost" size="sm" aria-label={`מחיקת שורה ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:items-start sm:[grid-template-columns:var(--cols)] sm:[&>div>label]:sr-only sm:[&>div]:!col-span-1">
            {cols.map((child) => renderChild(child, row, (id, v) => setCell(i, id, v), `${field.id}.${i}.`, disabled))}
            {!disabled && rows.length > minRows && (
              <Button variant="ghost" size="sm" className="hidden size-11 p-0 sm:inline-flex" aria-label={`מחיקת שורה ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </Card>
      ))}
      {!disabled && rows.length < maxRows && (
        <Button variant="outline" className="sm:mt-3" onClick={() => onChange([...rows, {}])}>
          <Plus className="size-4" />
          {String(s.addLabel ?? "הוספת שורה")}
        </Button>
      )}
    </div>
  );
}
