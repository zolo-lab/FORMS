"use client";
import type { PickMode } from "@/lib/forms/pick-mode";
import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FieldType } from "@/lib/forms/field-types";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { fieldStyleClass } from "@/lib/forms/field-style";
import { fieldSteps, fillsIn, type FillerRole, type FormDefinition, type FormField } from "@/lib/forms/schema";
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
  /** "עמוד חדש מכאן": the selected field and those after it on its page open a new page. */
  onSplitPage?: (id: string) => void;
  onRemovePage: (index: number) => void;
  onMovePage: (index: number, dir: -1 | 1) => void;
  /**
   * "סימון שדות לשלב": the fields of this step stand out with a ticked box, the others fade with an empty one; ticking
   * puts a field in the step, unticking takes it out ("לא משויך"). "unassigned" shows the fields that are in no step.
   */
  focusRole?: FillerRole;
  /** Step names by role ("שלב 2 · העובד"), shown on each field; a field whose role has no step is "לא משויך לשלב". */
  stepNames?: Partial<Record<FillerRole, string>>;
  /** "סימון בטופס": tick the fields the source field opens. */
  pick?: PickMode;
  /** "סימון שדות לשלב": tick = the field is also edited in that step, untick = not in it (its other steps stay). */
}

/** Dropped on the upper half of row `fi` → before it; on the lower half → after it. */
function halfOf(e: React.DragEvent, fi: number): number {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientY < r.top + r.height / 2 ? fi : fi + 1;
}

function readDrop(e: React.DragEvent): { type?: FieldType; fieldId?: string } {
  const type = e.dataTransfer.getData(DRAG_TYPE) as FieldType | "";
  const fieldId = e.dataTransfer.getData(DRAG_FIELD);
  return { type: type || undefined, fieldId: fieldId || undefined };
}

export function Canvas(p: CanvasProps) {
  const [over, setOver] = useState<string | null>(null);
  // Dragging a field (or a new type from the palette) over a row: a line shows where it will land, above or below it.
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ page: number; index: number } | null>(null);
  const endDrag = () => { setDragging(null); setDropAt(null); setOver(null); };
  // The gap between rows keeps one height (nothing jumps under the pointer) and takes a drop too.
  const line = (page: number, index: number) => (
    <div
      className="relative h-2"
      onDragOver={(e) => { e.preventDefault(); if (dropAt?.page !== page || dropAt.index !== index) setDropAt({ page, index }); }}
      onDrop={(e) => { e.preventDefault(); endDrag(); p.onDropAt(page, index, readDrop(e)); }}
    >
      {dropAt?.page === page && dropAt.index === index && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary" />}
    </div>
  );
  const zone = (page: number, index: number, key: string, children?: React.ReactNode) => (
    <div
      key={key}
      onDragOver={(e) => { e.preventDefault(); setOver(key); setDropAt(null); }}
      onDragLeave={() => setOver((o) => (o === key ? null : o))}
      onDrop={(e) => { e.preventDefault(); endDrag(); p.onDropAt(page, index, readDrop(e)); }}
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
                const answers = FIELD_TYPE_META[f.type].hasAnswer && f.type !== "hidden";
                // Every step that edits the field, by its name ("שלב 2 · העובד + שלב 3 · יוסי").
                const stepNamesOf = p.stepNames ? fieldSteps(f).map((r) => p.stepNames![r]).filter((n): n is string => !!n) : [];
                const stepName = stepNamesOf.length ? stepNamesOf.map((n, i) => (i ? n.replace(/^שלב (\d+) · /, "$1 · ") : n)).join(" + ") : undefined;
                const noStep = !!p.stepNames && answers && !stepName;
                const matches = p.focusRole === "unassigned" ? noStep : !!p.focusRole && fillsIn(f, p.focusRole);
                const inFocus = !!p.focusRole && answers && matches;
                const outOfFocus = !!p.focusRole && answers && !matches;
                const isSource = !!p.pick && p.pick.sourceId === f.id;
                const picking = !!p.pick && !isSource && f.type !== "hidden" && (!p.pick.answersOnly || answers);
                const picked = picking && p.pick!.ids.has(f.id);
                return (
                  <div key={f.id}>
                    {line(pi, fi)}
                    <div
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData(DRAG_FIELD, f.id); e.dataTransfer.effectAllowed = "move"; setDragging(f.id); }}
                      onDragEnd={endDrag}
                      onDragOver={(e) => {
                        e.preventDefault();
                        const index = halfOf(e, fi);
                        if (dropAt?.page !== pi || dropAt.index !== index) setDropAt({ page: pi, index });
                      }}
                      onDrop={(e) => {
                        // The place comes from the drop itself (the line may not have re-rendered yet).
                        e.preventDefault();
                        endDrag();
                        p.onDropAt(pi, halfOf(e, fi), readDrop(e));
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-md border bg-background p-2 transition-opacity",
                        dragging === f.id && "opacity-40",
                        selected && !p.pick && "border-primary ring-2 ring-primary/40",
                        !p.pick && inFocus && "border-2 border-primary bg-primary/10",
                        !p.pick && outOfFocus && "opacity-40 hover:opacity-100",
                        isSource && "border-2 border-success bg-success/10",
                        picked && "border-2 border-primary bg-primary/10",
                        picking && !picked && "opacity-60 hover:opacity-100",
                      )}
                    >
                      {picking && (
                        <input
                          type="checkbox"
                          className="size-5 shrink-0 accent-primary"
                          checked={picked}
                          onChange={() => p.pick!.onToggle(f.id)}
                          aria-label={`${f.label || "השדה"} ${p.pick!.checkLabel ?? "נפתח מהשדה המסומן"}`}
                        />
                      )}
                      <span title="גררו כדי להזיז (או בחצים)" className="flex h-9 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing">
                        <GripVertical className="size-4" aria-hidden />
                      </span>
                      {isSource && <span className="shrink-0 rounded bg-success/20 px-1.5 py-0.5 text-xs font-medium text-success">המקור</span>}
                      <button type="button" onClick={() => p.onSelect({ kind: "field", id: f.id })} className="flex min-w-0 flex-1 items-center gap-2 text-start" aria-pressed={selected}>
                        <FieldIcon type={f.type} className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className={cn("block truncate text-sm font-medium", fieldStyleClass(f.style))}>
                            {f.label || "(ללא תווית)"}
                            {f.required && <span className="ms-1 text-destructive">*</span>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {FIELD_TYPE_META[f.type].label}
                            {answers && stepName ? ` · ${stepName}` : ""}
                            {answers && !p.stepNames && f.filledBy && f.filledBy !== "employee" ? ` · ממלא: ${ROLE_LABELS[f.filledBy]}` : ""}
                            {noStep && <span className="text-destructive"> · לא משויך לשלב</span>}
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
                        {p.onSplitPage && fi > 0 && (
                          <Button variant="outline" size="sm" className="min-h-9 justify-self-start sm:col-span-2" onClick={() => p.onSplitPage!(f.id)}>
                            עמוד חדש מכאן
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {page.fields.length > 0 && line(pi, page.fields.length)}
              {page.fields.length > 0 && zone(pi, page.fields.length, `end-${pi}`, <div className="h-6" />)}
            </div>
          </section>
        );
      })}
      <Button variant="outline" onClick={p.onAddPage}><Plus className="size-4" />עמוד חדש</Button>
    </div>
  );
}
