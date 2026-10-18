"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { alignBoxes, distributeBoxes, snapPosition, type AlignMode, nextFreePosition } from "@/lib/pdf/arrange";
import { clampBox, pdfBoxToScreen, round1, screenBoxToPdf } from "@/lib/pdf/coords";
import { DEFAULT_SIZE, guessRowPitch, orphanStamps, placeableItems, replicateTableRow, stampKey, tableCellOf, type PlaceableItem } from "@/lib/forms/pdf-items";
import type { PdfMapping, PdfStamp } from "@/lib/forms/pdf-mapping";
import { allFields, type FormDefinition, type FormField } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";
import { baseFieldId, ROLE_OVERLAY } from "@/lib/pdf/role-style";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import { fillerRoles, type FillerRole } from "@/lib/forms/schema";
import { PDF_PALETTE, type PaletteEntry } from "@/lib/forms/pdf-draw";
import { PageCanvas } from "./PageCanvas";
import { StampStyleControls } from "./StampStyleControls";
import { StampFieldControls } from "./StampFieldControls";
import { RowReplicator } from "./RowReplicator";
import { usePdfDocument, type PdfSource } from "./usePdfDocument";

const ITEM_DRAG = "application/x-pdf-item";
const ELEMENT_DRAG = "application/x-pdf-element";

export interface PdfPlacementProps {
  definition: FormDefinition;
  source: PdfSource;
  pages: { width: number; height: number }[];
  mapping: PdfMapping;
  onMappingChange: (m: PdfMapping) => void;
  /** Optional server-side preview with sample data. */
  onPreview?: () => void;
  previewBusy?: boolean;
  /**
   * Draw-on-PDF mode: dropping a palette element creates a form field and a stamp.
   * Returns the new stamp id so it can be selected.
   */
  /** Change a field of the form from the stamp panel (e.g. who fills it). */
  onFieldPatch?: (fieldId: string, patch: Partial<FormField>) => void;
  onDrawElement?: (entry: PaletteEntry, page: number, at: { x: number; y: number }) => string;
  /** Copy/paste of an element: make a copy of its field and return the new field id (null = keep the same field). */
  onCloneField?: (fieldId: string) => string | null;
  /** Pressing "place" on a waiting field: a suggested stamp from the PDF's own text (null = no idea, the field goes to the page centre). */
  onSuggest?: (fieldId: string) => Promise<PdfStamp | null>;
  /** "New step from here": cut the form's step at this field. */
  onSplitStep?: (fieldId: string) => void;
}

export function PdfPlacement({ definition, source, pages, mapping, onMappingChange, onPreview, previewBusy, onDrawElement, onFieldPatch, onCloneField, onSuggest, onSplitStep }: PdfPlacementProps) {
  const { doc, error } = usePdfDocument(source);
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  /** Additional stamps selected with Shift/Ctrl-click (the primary one is `selected`). */
  const [extra, setExtra] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ page: number; axis: "x" | "y"; at: number }[]>([]);
  const history = useRef<{ past: PdfMapping[]; future: PdfMapping[] }>({ past: [], future: [] });
  const clipboard = useRef<PdfStamp[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(0);
  /** "צפה כ-": stamps of other roles are dimmed. */
  const [viewAs, setViewAs] = useState<FillerRole | "">("");
  /** Rows offered per table in the list; at least as many as are already placed (so their names resolve). */
  const [tableRowsSet, setTableRows] = useState<Record<string, number>>({});
  const tableRows = useMemo(() => {
    const out = { ...tableRowsSet };
    for (const s of mapping.stamps) {
      const c = tableCellOf(s.fieldId);
      if (c) out[c.table] = Math.max(out[c.table] ?? 1, c.row + 1);
    }
    return out;
  }, [tableRowsSet, mapping.stamps]);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const widest = Math.max(...pages.map((p) => p.width), 1);
  /** Zoom that makes the widest page fit the viewer (narrow windows). */
  const fitScale = () => {
    const w = viewerRef.current?.clientWidth ?? 0;
    return w > 0 ? Math.max(0.3, Math.floor(((w - 32) / widest) * 100) / 100) : 1;
  };
  // Start fitted when the window is narrower than the page, so the page is never cut off.
  const fitted = useRef(false);
  const attachViewer = (el: HTMLDivElement | null) => {
    viewerRef.current = el;
    if (!el || fitted.current) return;
    fitted.current = true;
    const f = fitScale();
    if (f < 1) setScale(f);
  };
  /** Bring a stamp into view after it was added (the page may be scrolled elsewhere). */
  const reveal = (id: string) => requestAnimationFrame(() => rootRef.current?.querySelector(`[data-stamp="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));

  const items = useMemo(() => placeableItems(definition, tableRows), [definition, tableRows]);
  const stampByKey = useMemo(() => new Map(mapping.stamps.map((s) => [stampKey(s), s])), [mapping.stamps]);
  const orphans = useMemo(() => orphanStamps(definition, mapping.stamps), [definition, mapping.stamps]);
  const selectedStamp = mapping.stamps.find((s) => s.id === selected) ?? null;
  const guessedCount = mapping.stamps.filter((s) => s.guessed).length;
  const group = useMemo(() => [...(selected ? [selected] : []), ...extra].filter((id) => mapping.stamps.some((s) => s.id === id)), [selected, extra, mapping.stamps]);
  const pushHistory = () => {
    history.current.past = [...history.current.past.slice(-49), latest.current];
    history.current.future = [];
  };
  const roleOf = (s: PdfStamp): FillerRole | "none" => allFields(definition).find((f) => f.id === baseFieldId(s.fieldId))?.filledBy ?? "none";
  const rolesUsed = [...new Set(mapping.stamps.map(roleOf))].filter((r): r is FillerRole => r !== "none");
  const labelOf = (s: PdfStamp) => items.find((i) => i.key === stampKey(s))?.label ?? s.fieldId;
  /** The form field a stamp writes; a table cell resolves to its column. */
  const fieldOf = (s: PdfStamp): FormField | undefined => {
    const cell = tableCellOf(s.fieldId);
    if (cell) return allFields(definition).find((f) => f.id === cell.table)?.fields?.find((c) => c.id === cell.column);
    return allFields(definition).find((f) => f.id === s.fieldId);
  };
  /** What a box on the page says: the field's own name (all text boxes used to read "טקסט"). */
  const chipOf = (s: PdfStamp) => {
    if (s.kind === "check") return "X";
    if (s.kind === "date_signed") return "תאריך חתימה";
    const f = fieldOf(s);
    const cell = tableCellOf(s.fieldId);
    const name = f?.label || labelOf(s);
    const part = s.part ? ` · ${labelOf(s)}` : "";
    return cell ? `${name} ${cell.row + 1}` : `${name}${part}`;
  };

  const setStamps = (stamps: PdfStamp[]) => { pushHistory(); onMappingChange({ ...mapping, stamps }); };
  const patchStamp = (id: string, patch: Partial<PdfStamp>) => setStamps(mapping.stamps.map((s) => (s.id === id ? { ...s, ...patch, guessed: undefined } : s)));
  const patchMany = (patches: Map<string, Partial<PdfStamp>>) => setStamps(mapping.stamps.map((s) => (patches.has(s.id) ? { ...s, ...patches.get(s.id) } : s)));
  const select = (id: string | null) => { setSelected(id); setExtra([]); };

  function place(item: PlaceableItem, page: number, at?: { x: number; y: number }) {
    const existing = stampByKey.get(item.key);
    // A waiting field with a single thing to place: try the PDF's own text first, the page centre otherwise.
    if (!at && !existing && onSuggest && !item.part && !item.whenValue && !/\[\d+\]\./.test(item.fieldId)) {
      void onSuggest(item.fieldId).then((guess) => {
        if (guess && !latest.current.stamps.some((s) => stampKey(s) === item.key)) {
          pushHistory();
          onMappingChange({ ...latest.current, stamps: [...latest.current.stamps, guess] });
          setSelected(guess.id);
          setExtra([]);
          setActivePage(guess.page);
          reveal(guess.id);
        } else {
          placeAt(item, page, existing);
        }
      });
      return;
    }
    placeAt(item, page, existing, at);
  }

  function placeAt(item: PlaceableItem, page: number, existing: PdfStamp | undefined, at?: { x: number; y: number }) {
    const size = DEFAULT_SIZE[item.kind];
    const dims = item.multiline ? { width: 200, height: 50 } : size;
    const pg = pages[page]!;
    const pos = at ?? { x: (pg.width - dims.width) / 2, y: pg.height / 2 };
    const box = clampBox({ ...pos, ...dims }, pg.width, pg.height);
    if (existing) {
      patchStamp(existing.id, { page, ...box });
      select(existing.id);
      return;
    }
    const stamp: PdfStamp = {
      id: nanoid(8), fieldId: item.fieldId, part: item.part, whenValue: item.whenValue, kind: item.kind, page, ...box,
      ...(item.multiline ? { multiline: true } : {}),
    };
    // Optional keys must be absent (not undefined) to keep the JSON clean.
    if (stamp.part === undefined) delete stamp.part;
    if (stamp.whenValue === undefined) delete stamp.whenValue;
    setStamps([...mapping.stamps, stamp]);
    select(stamp.id);
    reveal(stamp.id);
  }

  /** Place several items at once (e.g. every option of a choice), stacked under `from`. */
  function placeMany(list: PlaceableItem[], from: PdfStamp) {
    const pg = pages[from.page]!;
    const added: PdfStamp[] = list.map((item, i) => {
      const dims = DEFAULT_SIZE[item.kind];
      const box = clampBox({ x: from.x, y: from.y - (i + 1) * (dims.height + 6), ...dims }, pg.width, pg.height);
      const st: PdfStamp = { id: nanoid(8), fieldId: item.fieldId, kind: item.kind, page: from.page, x: round1(box.x), y: round1(box.y), width: box.width, height: box.height };
      if (item.part !== undefined) st.part = item.part;
      if (item.whenValue !== undefined) st.whenValue = item.whenValue;
      return st;
    });
    if (added.length === 0) return;
    setStamps([...mapping.stamps, ...added]);
    setSelected(added[0]!.id);
    setExtra(added.slice(1).map((a) => a.id));
    reveal(added[0]!.id);
  }

  function draw(entry: PaletteEntry, page: number, at?: { x: number; y: number }) {
    if (!onDrawElement) return;
    const dims = entry.size ?? DEFAULT_SIZE[entry.stamp.kind];
    const pg = pages[page]!;
    // A new element lands under the selected one (or under the last one added on that page).
    const onPage = latest.current.stamps.filter((o) => o.page === page && o.id !== selected);
    const anchor = latest.current.stamps.find((o) => o.id === selected && o.page === page);
    const pos = at ?? nextFreePosition(dims, pg, anchor ? [...onPage, anchor] : onPage);
    const box = clampBox({ ...pos, ...dims }, pg.width, pg.height);
    pushHistory();
    const id = onDrawElement(entry, page, { x: round1(box.x), y: round1(box.y) });
    select(id);
    reveal(id);
  }

  function startDrag(e: React.PointerEvent, stamp: PdfStamp, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    // preventDefault stops the browser focusing the stamp, so keep keyboard shortcuts working explicitly.
    rootRef.current?.focus({ preventScroll: true });
    if (mode === "move" && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      // Toggle membership in the multi-selection; no drag.
      if (group.includes(stamp.id)) {
        const rest = group.filter((id) => id !== stamp.id);
        setSelected(rest[0] ?? null);
        setExtra(rest.slice(1));
      } else {
        setExtra([...(selected ? [selected, ...extra] : extra)]);
        setSelected(stamp.id);
      }
      return;
    }
    const moving = mode === "move" && group.includes(stamp.id) && group.length > 1 ? group : [stamp.id];
    if (moving.length === 1) select(stamp.id);
    pushHistory();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const origins = new Map(latest.current.stamps.filter((s) => moving.includes(s.id)).map((s) => [s.id, { x: s.x, y: s.y, width: s.width, height: s.height, page: s.page }]));
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 3) return;
      moved = true;
      const dx = (ev.clientX - startX) / scale;
      const dy = -(ev.clientY - startY) / scale; // screen down = PDF down
      const patches = new Map<string, Partial<PdfStamp>>();
      const hit: { page: number; axis: "x" | "y"; at: number }[] = [];
      for (const [id, origin] of origins) {
        const pg = pages[origin.page]!;
        let box = mode === "move"
          ? { ...origin, x: origin.x + dx, y: origin.y + dy }
          // Resize from the bottom-end corner: width grows with dx, the top edge stays put.
          : { x: origin.x, width: origin.width + dx, height: origin.height - dy, y: origin.y + dy };
        if (mode === "move" && origins.size === 1) {
          const others = latest.current.stamps.filter((o) => o.id !== id && o.page === origin.page);
          const snapped = snapPosition(box, others);
          box = { ...box, x: snapped.x, y: snapped.y };
          hit.push(...snapped.guides.map((g) => ({ ...g, page: origin.page })));
        }
        const c = clampBox(box, pg.width, pg.height);
        // Touching a suggested placement confirms it.
        patches.set(id, { x: round1(c.x), y: round1(c.y), width: round1(c.width), height: round1(c.height), guessed: undefined });
      }
      setGuides(hit);
      onMappingChange({ ...latest.current, stamps: latest.current.stamps.map((s) => (patches.has(s.id) ? { ...s, ...patches.get(s.id) } : s)) });
    };
    const up = () => {
      setGuides([]);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // A click (no drag) on one box of a multi-selection selects just that box, so its own position can be edited.
      if (!moved && moving.length > 1) select(stamp.id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  // During a drag the closure's `mapping` is stale, so always patch from the latest ref.
  const latest = useRef(mapping);
  useEffect(() => { latest.current = mapping; });

  const selectedBoxes = () => group.map((id) => mapping.stamps.find((s) => s.id === id)!).filter(Boolean);
  function arrange(kind: AlignMode | "dist-x" | "dist-y") {
    const list = selectedBoxes();
    if (list.length < 2) return;
    const pos = kind === "dist-x" ? distributeBoxes(list, "x") : kind === "dist-y" ? distributeBoxes(list, "y") : alignBoxes(list, kind);
    patchMany(new Map(list.map((s, i) => [s.id, { x: round1(pos[i]!.x), y: round1(pos[i]!.y) }])));
  }
  function undo() {
    const h = history.current;
    const prev = h.past.at(-1);
    if (!prev) return;
    h.past = h.past.slice(0, -1);
    h.future = [latest.current, ...h.future];
    onMappingChange(prev);
    select(null);
  }
  function redo() {
    const h = history.current;
    const next = h.future[0];
    if (!next) return;
    h.future = h.future.slice(1);
    h.past = [...h.past, latest.current];
    onMappingChange(next);
  }
  function paste() {
    if (clipboard.current.length === 0) return;
    const copies = clipboard.current.map((s) => {
      const pg = pages[s.page]!;
      const c = clampBox({ ...s, x: s.x + 12, y: s.y - 12 }, pg.width, pg.height);
      // A pasted element gets its own new field (copy of the original); null = the same field is drawn again.
      const fieldId = onCloneField?.(s.fieldId) ?? s.fieldId;
      return { ...s, id: nanoid(8), fieldId, x: round1(c.x), y: round1(c.y) };
    });
    // Shift the clipboard so repeated pastes cascade.
    clipboard.current = copies;
    setStamps([...mapping.stamps, ...copies]);
    setSelected(copies[0]!.id);
    setExtra(copies.slice(1).map((c) => c.id));
    reveal(copies[0]!.id);
  }

  function onKey(e: React.KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === "c" && group.length) { clipboard.current = selectedBoxes() as PdfStamp[]; return; }
    if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); paste(); return; }
    if (mod && e.key.toLowerCase() === "d" && group.length) { e.preventDefault(); clipboard.current = selectedBoxes() as PdfStamp[]; paste(); return; }
    if (!selectedStamp) return;
    const step = e.shiftKey ? 10 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (d[e.key]) {
      e.preventDefault();
      const patches = new Map<string, Partial<PdfStamp>>();
      for (const s of selectedBoxes()) {
        const pg = pages[s.page]!;
        const c = clampBox({ ...s, x: s.x + d[e.key]![0], y: s.y + d[e.key]![1] }, pg.width, pg.height);
        patches.set(s.id, { x: round1(c.x), y: round1(c.y) });
      }
      patchMany(patches);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      const gone = new Set(group);
      setStamps(mapping.stamps.filter((s) => !gone.has(s.id)));
      select(null);
    }
  }

  const tables = allFields(definition).filter((f) => f.type === "repeating_table");
  // The selection is cells of one row of one table → offer to repeat it on the next rows.
  const rowSelection = (() => {
    const list = selectedBoxes();
    const cells = list.map((s) => tableCellOf(s.fieldId));
    const first = cells[0];
    if (!first || cells.some((c) => !c || c.table !== first.table || c.row !== first.row)) return null;
    const table = tables.find((t) => t.id === first.table);
    if (!table) return null;
    return { list, row: first.row, table, maxRows: Number(table.settings?.maxRows ?? 20) };
  })();
  const rowsFor = (t: (typeof tables)[number]) => tableRows[t.id] ?? (Math.max(1, Number(t.settings?.minRows ?? 1)) || 1);

  return (
    <div ref={rootRef} tabIndex={-1} className="grid gap-4 outline-none lg:grid-cols-[18rem_1fr_16rem]" onKeyDown={onKey}>
      {/* Fields to place */}
      <aside className="order-2 space-y-3 lg:order-none lg:max-h-[75vh] lg:overflow-auto" aria-label="סוגי שדות">
        <h3 className="text-sm font-semibold">סוגי שדות</h3>
        <p className="text-xs text-muted-foreground">גררו שדה אל העמוד, או לחצו + להוספה בעמוד הנוכחי. לחיצה על שדה בעמוד פותחת את המאפיינים שלו משמאל.</p>
        {guessedCount > 0 && (
          <div role="status" className="space-y-2 rounded-md border border-dashed border-primary bg-primary/5 p-2 text-xs">
            <p>{guessedCount} שיבוצים הוצעו אוטומטית (מסומנים בקו מקווקו). גרירה או שינוי גודל מאשרים שיבוץ.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setStamps(mapping.stamps.map((s) => (s.guessed ? { ...s, guessed: undefined } : s)))}>אישור כל ההצעות</Button>
              <Button size="sm" variant="ghost" onClick={() => setStamps(mapping.stamps.filter((s) => !s.guessed))}>הסרת ההצעות</Button>
            </div>
          </div>
        )}
        {tables.map((t) => {
          const current = rowsFor(t);
          const max = Number(t.settings?.maxRows ?? 20);
          return (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span>שורות ב&quot;{t.label}&quot;</span>
              <span className="flex items-center gap-1">
                <Button variant="outline" size="sm" aria-label="פחות שורות" onClick={() => setTableRows((r) => ({ ...r, [t.id]: Math.max(1, current - 1) }))}><Minus className="size-3" /></Button>
                <span className="w-5 text-center">{current}</span>
                <Button variant="outline" size="sm" aria-label="עוד שורות" onClick={() => setTableRows((r) => ({ ...r, [t.id]: Math.min(max, current + 1) }))}><Plus className="size-3" /></Button>
              </span>
            </div>
          );
        })}
        {onDrawElement && (
          <section aria-label="סוגי שדות להוספה">
            <ul className="grid grid-cols-2 gap-1">
              {PDF_PALETTE.map((entry) => (
                <li
                  key={entry.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(ELEMENT_DRAG, entry.id)}
                  className="flex items-center justify-between gap-1 rounded-md border bg-card px-2 py-1 text-xs"
                >
                  <span className="truncate">{entry.label}</span>
                  <Button variant="ghost" size="sm" aria-label={`הוספת ${entry.label}`} onClick={() => draw(entry, activePage)}><Plus className="size-3" /></Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {orphans.length > 0 && (
          <section className="rounded-md border border-destructive p-2 text-sm">
            <p className="font-medium text-destructive">חותמות של שדות שנמחקו ({orphans.length})</p>
            <Button variant="outline" size="sm" className="mt-1" onClick={() => setStamps(mapping.stamps.filter((s) => !orphans.includes(s)))}>הסרה</Button>
          </section>
        )}
      </aside>

      {/* Pages */}
      <div className="order-1 min-w-0 space-y-3 lg:order-none">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>זום</span>
          {[0.75, 1, 1.25, 1.5].map((z) => (
            <Button key={z} size="sm" variant={scale === z ? "default" : "outline"} onClick={() => setScale(z)}>{Math.round(z * 100)}%</Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setScale(fitScale())}>התאמה לרוחב</Button>
          {group.length >= 2 && (
            <div role="toolbar" aria-label="יישור" className="flex flex-wrap items-center gap-1 rounded-md border bg-card px-2 py-1">
              <span className="text-xs text-muted-foreground">{group.length} נבחרו</span>
              {([
                ["right", "יישור לימין", "ימין"], ["left", "יישור לשמאל", "שמאל"], ["top", "יישור למעלה", "למעלה"], ["bottom", "יישור למטה", "למטה"],
                ["center-x", "מרכוז אופקי", "מרכז ↔"], ["center-y", "מרכוז אנכי", "מרכז ↕"],
              ] as const).map(([mode, aria, text]) => (
                <Button key={mode} size="sm" variant="outline" aria-label={aria} onClick={() => arrange(mode)}>{text}</Button>
              ))}
              {group.length >= 3 && (
                <>
                  <Button size="sm" variant="outline" aria-label="פיזור אופקי" onClick={() => arrange("dist-x")}>פיזור ↔</Button>
                  <Button size="sm" variant="outline" aria-label="פיזור אנכי" onClick={() => arrange("dist-y")}>פיזור ↕</Button>
                </>
              )}
            </div>
          )}
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            צפה כ-
            <Select className="h-8 w-32" aria-label="צפה כתפקיד" value={viewAs} onChange={(e) => setViewAs(e.target.value as FillerRole | "")}>
              <option value="">כולם</option>
              {fillerRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </label>
          {onPreview && <Button className="lg:ms-auto" variant="secondary" disabled={previewBusy} onClick={onPreview}>{previewBusy ? "מכין…" : "תצוגה מקדימה עם נתוני דוגמה"}</Button>}
        </div>
        {doc && pages.length > 1 && (
          <nav aria-label="עמודים" className="flex gap-2 overflow-x-auto py-1" dir="ltr">
            {pages.map((pg, pi) => {
              const t = Math.min(90 / pg.width, 120 / pg.height);
              return (
                <button
                  key={pi}
                  type="button"
                  aria-label={`עמוד ${pi + 1}`}
                  aria-current={activePage === pi ? "page" : undefined}
                  onClick={() => { setActivePage(pi); pageRefs.current[pi]?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                  className={cn("shrink-0 overflow-hidden rounded border-2 bg-card", activePage === pi ? "border-primary" : "border-transparent hover:border-muted-foreground/40")}
                  style={{ width: pg.width * t, height: pg.height * t }}
                >
                  <PageCanvas doc={doc} pageNumber={pi + 1} scale={t} />
                </button>
              );
            })}
          </nav>
        )}
        {rolesUsed.length > 0 && (
          <ul aria-label="מקרא תפקידים" className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {rolesUsed.map((r) => (
              <li key={r} className="flex items-center gap-1"><span className={cn("size-2.5 rounded-full", ROLE_OVERLAY[r].dot)} />{ROLE_LABELS[r]}</li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div ref={attachViewer} className="max-h-[75vh] space-y-4 overflow-auto rounded-lg bg-muted p-3">
          {!doc && !error && <p role="status" className="py-16 text-center text-sm text-muted-foreground">טוען את ה-PDF…</p>}
          {/* PDF space is physical (origin bottom-left, x to the right), so this subtree is LTR. */}
          <div dir="ltr" className="space-y-4">
            {doc && pages.map((pg, pi) => (
              <div
                key={pi}
                ref={(el) => { pageRefs.current[pi] = el; }}
                data-testid={`pdf-page-${pi}`}
                className="relative mx-auto shadow"
                style={{ width: pg.width * scale, height: pg.height * scale }}
                onPointerDown={() => { setActivePage(pi); select(null); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const entry = PDF_PALETTE.find((p) => p.id === e.dataTransfer.getData(ELEMENT_DRAG));
                  if (entry) {
                    const r = pageRefs.current[pi]!.getBoundingClientRect();
                    const d = entry.size ?? DEFAULT_SIZE[entry.stamp.kind];
                    const b = screenBoxToPdf({ x: e.clientX - r.left, y: e.clientY - r.top, width: d.width * scale, height: d.height * scale }, pg.height, scale);
                    draw(entry, pi, { x: round1(b.x), y: round1(b.y) });
                    return;
                  }
                  const item = items.find((i) => i.key === e.dataTransfer.getData(ITEM_DRAG));
                  if (!item) return;
                  const rect = pageRefs.current[pi]!.getBoundingClientRect();
                  const dims = item.multiline ? { width: 200, height: 50 } : DEFAULT_SIZE[item.kind];
                  const box = screenBoxToPdf({ x: e.clientX - rect.left, y: e.clientY - rect.top, width: dims.width * scale, height: dims.height * scale }, pg.height, scale);
                  place(item, pi, { x: round1(box.x), y: round1(box.y) });
                }}
              >
                <PageCanvas doc={doc} pageNumber={pi + 1} scale={scale} />
                {mapping.stamps.filter((s) => s.page === pi).map((s) => {
                  const b = pdfBoxToScreen(s, pg.height, scale);
                  const active = s.id === selected;
                  const inGroup = group.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${s.fieldId} ${labelOf(s)}`}
                      data-stamp={s.id}
                      onPointerDown={(e) => startDrag(e, s, "move")}
                      className={cn(
                        "absolute cursor-move touch-none border-2 text-[10px] leading-none",
                        inGroup ? ROLE_OVERLAY[roleOf(s)].boxActive : ROLE_OVERLAY[roleOf(s)].box,
                        orphans.includes(s) && "border-destructive bg-destructive/15",
                        s.guessed && "border-dashed",
                        viewAs && (roleOf(s) === "none" ? "employee" : roleOf(s)) !== viewAs && !inGroup && "opacity-25",
                      )}
                      style={{ left: b.x, top: b.y, width: b.width, height: b.height }}
                    >
                      <span className="pointer-events-none block truncate px-0.5 text-primary" title={chipOf(s)}>{chipOf(s)}</span>
                      {active && (
                        <span
                          aria-label="שינוי גודל"
                          onPointerDown={(e) => startDrag(e, s, "resize")}
                          className="absolute -bottom-1.5 -end-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-primary bg-card"
                        />
                      )}
                    </div>
                  );
                })}
                {guides.filter((g) => g.page === pi).map((g, gi) => {
                  const line = g.axis === "x"
                    ? { left: g.at * scale, top: 0, width: 1, height: "100%" }
                    : { left: 0, top: (pg.height - g.at) * scale, width: "100%", height: 1 };
                  return <div key={gi} aria-hidden className="pointer-events-none absolute bg-primary" style={line} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected stamp settings */}
      <aside className="order-3 space-y-3 rounded-lg border bg-card p-3 lg:order-none" aria-label="הגדרות חותמת">
        {!selectedStamp ? (
          <p className="text-sm text-muted-foreground">בחרו חותמת על העמוד כדי לערוך אותה. חיצים מזיזים (Shift = 10), Delete מוחק.</p>
        ) : (
          <>
            <p className="text-sm font-medium">{fieldOf(selectedStamp)?.label || labelOf(selectedStamp)}</p>
            <p className="text-xs text-muted-foreground">
              {labelOf(selectedStamp)} · <bdi dir="ltr">{selectedStamp.fieldId}{selectedStamp.part ? `.${selectedStamp.part}` : ""}</bdi>
            </p>
            {onFieldPatch && fieldOf(selectedStamp) && (
              <StampFieldControls
                field={fieldOf(selectedStamp)!}
                stamp={selectedStamp}
                placed={(value) => stampByKey.has(stampKey({ fieldId: selectedStamp.fieldId, whenValue: value }))}
                onFieldPatch={(patch) => onFieldPatch(selectedStamp.fieldId, patch)}
                onStampPatch={(patch) => patchStamp(selectedStamp.id, patch)}
                onPlaceOptions={(values) => placeMany(
                  values.map((v) => items.find((i) => i.key === stampKey({ fieldId: selectedStamp.fieldId, whenValue: v }))).filter((i): i is PlaceableItem => !!i),
                  selectedStamp,
                )}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              {(["x", "y", "width", "height"] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-muted-foreground">{{ x: "X", y: "Y", width: "רוחב", height: "גובה" }[k]}</Label>
                  <Input type="number" dir="ltr" className="h-9 text-start" value={selectedStamp[k]} onChange={(e) => {
                    const pg = pages[selectedStamp.page]!;
                    const c = clampBox({ ...selectedStamp, [k]: Number(e.target.value) || 0 }, pg.width, pg.height);
                    patchStamp(selectedStamp.id, { x: c.x, y: c.y, width: c.width, height: c.height });
                  }} />
                </div>
              ))}
            </div>
            {onSplitStep && fieldOf(selectedStamp) && !tableCellOf(selectedStamp.fieldId) && (
              <Button size="sm" variant="outline" className="min-h-9" onClick={() => onSplitStep(selectedStamp.fieldId)}>שלב חדש מכאן</Button>
            )}
            {onFieldPatch && !["date_signed", "stamp_image"].includes(selectedStamp.kind) && (
              <div className="space-y-1">
                <Label className="text-muted-foreground">מי ממלא</Label>
                <Select className="h-9" aria-label="מי ממלא" value={roleOf(selectedStamp) === "none" ? "" : roleOf(selectedStamp)} onChange={(e) => onFieldPatch(baseFieldId(selectedStamp.fieldId), { filledBy: (e.target.value || undefined) as FillerRole | undefined })}>
                  <option value="">ללא תפקיד מוגדר</option>
                  {fillerRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
              </div>
            )}
            {selectedStamp.kind === "stamp_image" && (
              <div className="space-y-1">
                <Label className="text-muted-foreground">תמונת החותמת (PNG/JPG עד 300KB)</Label>
                {selectedStamp.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL chosen by the admin
                  <img src={selectedStamp.image} alt="" className="max-h-20 rounded border bg-white p-1" />
                )}
                <Input
                  type="file"
                  accept="image/png,image/jpeg"
                  aria-label="תמונת החותמת"
                  className="h-9"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 300 * 1024) { setImageError("התמונה גדולה מדי (עד 300KB)"); return; }
                    setImageError(null);
                    const reader = new FileReader();
                    reader.onload = () => patchStamp(selectedStamp.id, { image: String(reader.result) });
                    reader.readAsDataURL(file);
                  }}
                />
                {imageError && <p role="alert" className="text-xs text-destructive">{imageError}</p>}
              </div>
            )}
            {rowSelection && (
              <RowReplicator
                key={rowSelection.list.map((s) => s.id).join()}
                row={rowSelection.row}
                maxRows={rowSelection.maxRows}
                cells={rowSelection.list.length}
                pitch={guessRowPitch(mapping.stamps, rowSelection.list)}
                onApply={(count, pitch) => {
                  const added = replicateTableRow(mapping.stamps, rowSelection.list, count, pitch, () => nanoid(8));
                  if (added.length === 0) return;
                  setStamps([...mapping.stamps, ...added]);
                  const t = rowSelection.table.id;
                  setTableRows((r) => ({ ...r, [t]: Math.max(r[t] ?? 1, rowSelection.row + count + 1) }));
                }}
              />
            )}
            <StampStyleControls stamp={selectedStamp} pageCount={pages.length} onPatch={(patch) => patchStamp(selectedStamp.id, patch)} />
            <div className="space-y-1">
              <Label className="text-muted-foreground">עמוד</Label>
              <Select className="h-9" value={selectedStamp.page} onChange={(e) => {
                const page = Number(e.target.value);
                const pg = pages[page]!;
                const c = clampBox(selectedStamp, pg.width, pg.height);
                patchStamp(selectedStamp.id, { page, ...c });
              }}>
                {pages.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              title="אותה תשובה תיכתב במקום נוסף (למשל מספר זהות בראש כל עמוד). Ctrl+D יוצר שדה חדש."
              onClick={() => {
                const pg = pages[selectedStamp.page]!;
                const c = clampBox({ ...selectedStamp, x: selectedStamp.x + 12, y: selectedStamp.y - 12 }, pg.width, pg.height);
                const copy = { ...selectedStamp, id: nanoid(8), x: round1(c.x), y: round1(c.y) };
                setStamps([...mapping.stamps, copy]);
                select(copy.id);
                reveal(copy.id);
              }}
            >
              מופע נוסף של אותה תשובה
            </Button>
            <Button variant="destructive" size="sm" onClick={() => { setStamps(mapping.stamps.filter((s) => s.id !== selectedStamp.id)); setSelected(null); }}>
              <Trash2 className="size-4" />הסרת החותמת
            </Button>
          </>
        )}
        <p className="border-t pt-2 text-xs text-muted-foreground">{mapping.stamps.length} חותמות ממופות</p>
      </aside>
    </div>
  );
}
