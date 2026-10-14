"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FieldType } from "@/lib/forms/field-types";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { fieldStyleClass } from "@/lib/forms/field-style";
import type { FormDefinition, FormField } from "@/lib/forms/schema";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FieldIcon } from "./field-icon";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import { DRAG_FIELD, DRAG_TYPE } from "./Palette";

export type Selection = { kind: "field"; id: string } | { kind: "page"; index: number };

export interface CanvasProps {
  def: FormDefinition;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  /** Inline edits made directly on the selected field. */
  onPatchField: (id: string, patch: Partial<FormField>) => void;
  onDropAt: (page: number, index: number, data: { type?: FieldType; fieldId?: string }) => void;
  onMoveField: (id: string, dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAddPage: () => void;
  onRemovePage: (index: number) => void;
  onMovePage: (index: number, dir: -1 | 1) => void;
}

function readDrop(e: React.DragEvent): { type?: FieldType; fieldId?: string } {
  const type = e.dataTransfer.getData(DRAG_TYPE) as FieldType | "";
  const fieldId = e.dataTransfer.getData(DRAG_FIELD);
  return { type: type || undefined, fieldId: fieldId || undefined };
}

export function Canvas(p: CanvasProps) {
  const [over, setOver] = useState<string | null>(null);
  const zone = (page: number, index: number, key: string, children?: React.ReactNode) => (
    <div
      key={key}
      onDragOver={(e) => { e.preventDefault(); setOver(key); }}
      onDragLeave={() => setOver((o) => (o === key ? null : o))}
      onDrop={(e) => { e.preventDefault(); setOver(null); p.onDropAt(page, index, readDrop(e)); }}
      className={cn("rounded-md transition-colors", over === key ? "bg-primary/15 ring-2 ring-primary" : "")}
    >
      {children}
    </div>
  );

  return (
    <div className="space-y-6">
      {p.def.pages.map((page, pi) => {
        const pageSelected = p.selection?.kind === "page" && p.selection.index === pi;
        return (
          <section key={page.id} className="rounded-lg border bg-card">
            <header
              className={cn("flex items-center gap-2 border-b px-3 py-2", pageSelected && "bg-accent")}
            >
              <button type="button" className="flex-1 text-start font-semibold" onClick={() => p.onSelect({ kind: "page", index: pi })}>
                {page.title || `עמוד ${pi + 1}`}
                {page.visibleIf && <span className="ms-2 text-xs font-normal text-muted-foreground">(מותנה)</span>}
              </button>
              <Button variant="ghost" size="sm" aria-label="העברת עמוד למעלה" disabled={pi === 0} onClick={() => p.onMovePage(pi, -1)}><ArrowUp className="size-4" /></Button>
              <Button variant="ghost" size="sm" aria-label="העברת עמוד למטה" disabled={pi === p.def.pages.length - 1} onClick={() => p.onMovePage(pi, 1)}><ArrowDown className="size-4" /></Button>
              <Button variant="ghost" size="sm" aria-label="מחיקת עמוד" disabled={p.def.pages.length <= 1} onClick={() => p.onRemovePage(pi)}><Trash2 className="size-4" /></Button>
            </header>
            <div className="space-y-1 p-3">
              {page.fields.length === 0 && zone(pi, 0, `empty-${pi}`, (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">גררו לכאן שדה מהרשימה, או לחצו עליו</p>
              ))}
              {page.fields.map((f, fi) => {
                const selected = p.selection?.kind === "field" && p.selection.id === f.id;
                return (
                  <div key={f.id}>
                    {zone(pi, fi, `before-${f.id}`, <div className="h-2" />)}
                    <div
                      draggable={!selected}
                      onDragStart={(e) => { e.dataTransfer.setData(DRAG_FIELD, f.id); e.dataTransfer.effectAllowed = "move"; }}
                      className={cn("flex items-center gap-2 rounded-md border bg-background p-2", selected && "border-primary ring-2 ring-primary/40")}
                    >
                      <button type="button" onClick={() => p.onSelect({ kind: "field", id: f.id })} className="flex min-w-0 flex-1 items-center gap-2 text-start" aria-pressed={selected}>
                        <FieldIcon type={f.type} className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className={cn("block truncate text-sm font-medium", fieldStyleClass(f.style))}>
                            {f.label || "(ללא תווית)"}
                            {f.required && <span className="ms-1 text-destructive">*</span>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {FIELD_TYPE_META[f.type].label}
                            {f.filledBy && f.filledBy !== "employee" ? ` · ממלא: ${ROLE_LABELS[f.filledBy]}` : ""}
                            {f.visibleIf ? " · מותנה" : ""}
                          </span>
                        </span>
                      </button>
                      <Button variant="ghost" size="sm" aria-label="הזזה למעלה" disabled={pi === 0 && fi === 0} onClick={() => p.onMoveField(f.id, -1)}><ArrowUp className="size-4" /></Button>
                      <Button variant="ghost" size="sm" aria-label="הזזה למטה" disabled={pi === p.def.pages.length - 1 && fi === page.fields.length - 1} onClick={() => p.onMoveField(f.id, 1)}><ArrowDown className="size-4" /></Button>
                      <Button variant="ghost" size="sm" aria-label="שכפול שדה" onClick={() => p.onDuplicate(f.id)}><Copy className="size-4" /></Button>
                      <Button variant="ghost" size="sm" aria-label="מחיקת שדה" onClick={() => p.onRemove(f.id)}><Trash2 className="size-4" /></Button>
                    </div>
                    {selected && (
                      <div className="mt-1 grid gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 sm:grid-cols-2" aria-label="עריכה מהירה">
                        <Input
                          aria-label="תווית השדה"
                          value={f.label}
                          placeholder={f.type === "info_text" ? "הטקסט שיוצג" : "תווית"}
                          onChange={(e) => p.onPatchField(f.id, { label: e.target.value })}
                        />
                        {f.type !== "divider" && f.type !== "info_text" && f.type !== "image" && (
                          <Input
                            aria-label="הסבר לשדה"
                            value={f.description ?? ""}
                            placeholder="הסבר קצר מתחת לתווית (לא חובה)"
                            onChange={(e) => p.onPatchField(f.id, { description: e.target.value || undefined })}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {page.fields.length > 0 && zone(pi, page.fields.length, `end-${pi}`, <div className="h-6" />)}
            </div>
          </section>
        );
      })}
      <Button variant="outline" onClick={p.onAddPage}><Plus className="size-4" />עמוד חדש</Button>
    </div>
  );
}
