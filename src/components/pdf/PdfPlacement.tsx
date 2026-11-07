"use client";
import type { PickMode } from "@/lib/forms/pick-mode";
import type { FixResult } from "@/lib/forms/detect-fixes";
import { StepChecks, type StepView } from "@/components/builder/StepSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { alignBoxes, distributeBoxes, snapPosition, snapToText, type AlignMode, type TextAnchor, nextFreePosition } from "@/lib/pdf/arrange";
import { extractPageTexts } from "./extract-page-data";
import { clampBox, pdfBoxToScreen, round1, screenBoxToPdf } from "@/lib/pdf/coords";
import { DEFAULT_SIZE, guessRowPitch, orphanStamps, placeableItems, replicateTableRow, stampKey, tableCellOf, type PlaceableItem } from "@/lib/forms/pdf-items";
import type { PdfMapping, PdfStamp } from "@/lib/forms/pdf-mapping";
import { allFields, fillsIn, type FormDefinition, type FormField } from "@/lib/forms/schema";
import { comboPatch, stepComboOptions } from "@/lib/workflow/step-fields";
import { cn } from "@/lib/utils";
import { baseFieldId, ROLE_OVERLAY } from "@/lib/pdf/role-style";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import { fillerRoles, type FillerRole } from "@/lib/forms/schema";
import { cloneField, pdfPaletteEntry, pdfPaletteGroups, type PaletteEntry } from "@/lib/forms/pdf-draw";
import { FieldIcon } from "@/components/builder/field-icon";
import { PageCanvas } from "./PageCanvas";
import { StampStyleControls } from "./StampStyleControls";
import { StampFieldControls } from "./StampFieldControls";
import { RowReplicator } from "./RowReplicator";
import { usePdfDocument, type PdfSource } from "./usePdfDocument";

const ITEM_DRAG = "application/x-pdf-item";
const ELEMENT_DRAG = "application/x-pdf-element";

export interface PdfPlacementProps {
  definition: FormDefinition;
  /** The fields defined in the organizations page: a field's "שם מזהה" can be one of them (then it fills from it). */
  orgFields?: { key: string; label: string }[];
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
  /** The form's steps, to choose the step a field belongs to. */
  steps?: StepView[];
  /** Set by the editor's "הדגשת השדות של": boxes of other steps fade. When given, the local "צפה כ-" picker is hidden. */
  focusRole?: FillerRole | "";
  onDrawElement?: (entry: PaletteEntry, page: number, at: { x: number; y: number }) => string;
  /** Copy/paste of an element: make a copy of its field and return the new field id (null = keep the same field). */
  onCloneField?: (fieldId: string) => string | null;
  /** Pressing "place" on a waiting field: a suggested stamp from the PDF's own text (null = no idea, the field goes to the page centre). */
  onSuggest?: (fieldId: string) => Promise<PdfStamp | null>;
  /** "סימון בטופס": a click marks or unmarks the box's field as opened by the source field; nothing moves. */
  pick?: PickMode;
  /** Detection fixes that change the form and its boxes together (see detect-fixes.ts). */
  onTransform?: (fix: (def: FormDefinition, stamps: PdfStamp[]) => FixResult) => string | undefined;
  /** The fields of the selected boxes, for the editor's single step picker. When given, the in-viewer "העברה לשלב" bar is not shown. */
}

export function PdfPlacement({ definition, source, pages, mapping, onMappingChange, onPreview, previewBusy, onDrawElement, onFieldPatch, onCloneField, onSuggest, pick, onTransform, orgFields = [], steps = [{ index: 0, role: "requester", label: "שלב 1 · השולח" }, { index: 1, role: "employee", label: "שלב 2 · העובד" }], focusRole }: PdfPlacementProps) {
  const { doc, error } = usePdfDocument(source);

  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  /** Additional stamps selected with Shift/Ctrl-click (the primary one is `selected`). */
  const [extra, setExtra] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ page: number; axis: "x" | "y"; at: number }[]>([]);
  /** The printed name a box being dragged lines up with (highlighted on the page). */
  const [snapText, setSnapText] = useState<{ page: number; text: TextAnchor } | null>(null);
  /** Printed text of each page, to line fields up with the names next to them. */
  const [texts, setTexts] = useState<TextAnchor[][]>([]);
  useEffect(() => {
    if (!doc) return;
    let live = true;
    extractPageTexts(doc).then((t) => { if (live) setTexts(t); }).catch(() => {});
    return () => { live = false; };
  }, [doc]);
  /** A box dropped or added near a printed name lands on its row, flush against it. */
  const besideText = (page: number, box: { x: number; y: number; width: number; height: number }) => {
    const r = snapToText(box, texts[page] ?? [], { tolerance: 10, sideTolerance: 40 });
    return { ...box, x: r.x, y: r.y };
  };
  // Undo on the PDF: the boxes, plus the form only for actions that changed it too (a paste adds fields), so both
  // come back together and an undo of a box move never rolls back a field edited since.
  type Snapshot = { mapping: PdfMapping; definition?: FormDefinition };
  const history = useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const clipboard = useRef<PdfStamp[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(0);
  /** "צפה כ-": stamps of other roles are dimmed. */
  const [localViewAs, setViewAs] = useState<FillerRole | "">("");
  const viewAs = focusRole !== undefined ? focusRole : localViewAs;
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
  const pushHistory = (withDefinition = false) => {
    history.current.past = [...history.current.past.slice(-49), now(withDefinition)];
    history.current.future = [];
  };
  /** The step role of the field a box writes ("none" for boxes that are not a field, e.g. the signing date). */
  const roleOf = (s: PdfStamp): FillerRole | "none" => {
    const f = allFields(definition).find((x) => x.id === baseFieldId(s.fieldId));
    return f ? (f.filledBy ?? "employee") : "none";
  };
  const stepRoles = new Set(steps.map((v) => v.role));
  /** A box whose field is in no step of the form is drawn as "not in a step". */
  const shownRole = (s: PdfStamp): FillerRole | "none" => { const r = roleOf(s); return r === "none" || stepRoles.has(r) ? r : "unassigned"; };
  /**
   * "העתקת תיבה": nothing is added yet. The next click on the document pastes there a copy: a new field like the
   * original (same type, label and settings). Esc cancels.
   */
  /**
   * Add copies of boxes, already moved to their new place. Every box is its own field (the PDF and the responsive
   * form always list the same fields), so each copy gets a new field just like its original: same type, label and
   * settings. Field and box change in one step (one undo). A table cell stays in its table; a part of a field
   * (bank.branch) copies the whole field and keeps the part. Without a form to add to, the box shares the field.
   */
  function addCopies(boxes: PdfStamp[]): PdfStamp[] {
    const copies = boxes.map((b) => ({ ...b, id: nanoid(8) }));
    const cloneAll = (def: FormDefinition) => {
      let d = def;
      const out = copies.map((b) => {
        if (tableCellOf(b.fieldId)) return b;
        const base = baseFieldId(b.fieldId);
        const r = cloneField(d, base);
        if (!r) return b;
        d = r.definition;
        return { ...b, fieldId: r.fieldId + b.fieldId.slice(base.length) };
      });
      return { def: d, out };
    };
    if (onTransform) {
      let added = copies;
      // Ctrl+Z here restores the boxes; the editor then drops the copied field, which has no box left.
      pushHistory(true);
      onTransform((def, stamps) => {
        const { def: d, out } = cloneAll(def);
        added = out;
        return { def: d, stamps: [...stamps, ...out] };
      });
      return added;
    }
    const out = copies.map((b) => {
      if (tableCellOf(b.fieldId)) return b;
      const base = baseFieldId(b.fieldId);
      const id = onCloneField?.(base);
      return id ? { ...b, fieldId: id + b.fieldId.slice(base.length) } : b;
    });
    setStamps([...mapping.stamps, ...out]);
    return out;
  }
  const [boxCopy, setBoxCopyState] = useState<PdfStamp | null>(null);
  // What is chosen right now, kept in step at once (a touch tap is decided when the finger lifts, maybe after Esc).
  const chosenNow = useRef<{ placing: PaletteEntry | null; boxCopy: PdfStamp | null }>({ placing: null, boxCopy: null });
  const setBoxCopy = (v: PdfStamp | null) => { chosenNow.current = { ...chosenNow.current, boxCopy: v }; setBoxCopyState(v); };
  const setPlacing = (v: PaletteEntry | null) => { chosenNow.current = { ...chosenNow.current, placing: v }; setPlacingState(v); };
  const pasteBoxAt = (page: number, at: { x: number; y: number }) => {
    if (!boxCopy) return;
    const pg = pages[page]!;
    const c = clampBox({ width: boxCopy.width, height: boxCopy.height, x: at.x - boxCopy.width / 2, y: at.y - boxCopy.height / 2 }, pg.width, pg.height);
    const [copy] = addCopies([{ ...boxCopy, page, x: round1(c.x), y: round1(c.y) }]);
    setBoxCopy(null);
    select(copy!.id);
  };
  /** The box belongs to the step marked above: the step is its field's own, or one it shares. */
  const inViewStep = (s: PdfStamp): boolean => {
    if (!viewAs) return false;
    if (viewAs === "unassigned") return shownRole(s) === "unassigned";
    const f = allFields(definition).find((x) => x.id === baseFieldId(s.fieldId));
    return !!f && fillsIn(f, viewAs);
  };
  const rolesUsed = [...new Set(mapping.stamps.map(shownRole))].filter((r): r is FillerRole => r !== "none");
  const roleName = (r: FillerRole) => steps.filter((v) => v.role === r).map((v) => v.label).join(" / ") || ROLE_LABELS[r];
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
    const box = clampBox(at ? besideText(page, { ...pos, ...dims }) : { ...pos, ...dims }, pg.width, pg.height);
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

  /**
   * Adding from the list of field types: the type is chosen first, then a click on the document puts it exactly there
   * (as with a pasted box). "במקום פנוי" keeps the old way, and is how the keyboard adds one. Esc cancels.
   */
  const [placing, setPlacingState] = useState<PaletteEntry | null>(null);
  // The pointer of a touch tap waiting for its finger to lift.
  const pendingTap = useRef<number | null>(null);
  /** The point under the pointer on page `pi`, as the top corner of a box of the entry's size (like a drop). */
  function drawAtPointer(entry: PaletteEntry, pi: number, clientX: number, clientY: number) {
    const pg = pages[pi]!;
    const r = pageRefs.current[pi]!.getBoundingClientRect();
    const d = entry.size ?? DEFAULT_SIZE[entry.stamp.kind];
    const b = screenBoxToPdf({ x: clientX - r.left, y: clientY - r.top, width: d.width * scale, height: d.height * scale }, pg.height, scale);
    draw(entry, pi, { x: round1(b.x), y: round1(b.y) });
  }

  /**
   * A chosen type (or a copied box) goes where the document was pressed, also on top of another box (then that box
   * is not dragged). Only the main button: a right click opens the menu and places nothing. True when it was used.
   */
  function putChosenAt(e: React.PointerEvent, pi: number): boolean {
    if (!placing && !boxCopy) return false;
    if (e.button !== 0) return true;
    const put = (clientX: number, clientY: number) => {
      if (placing) {
        drawAtPointer(placing, pi, clientX, clientY);
        setPlacing(null);
      } else {
        const r = pageRefs.current[pi]!.getBoundingClientRect();
        const at = screenBoxToPdf({ x: clientX - r.left, y: clientY - r.top, width: 0, height: 0 }, pages[pi]!.height, scale);
        pasteBoxAt(pi, { x: at.x, y: at.y });
      }
    };
    if (e.pointerType === "mouse") { put(e.clientX, e.clientY); return true; }
    // A finger or a pen may be starting to scroll: place only on a tap (that same pointer lifted without moving),
    // never on a swipe. One pending tap at a time (a second finger does nothing), and it is dropped when the chosen
    // type or copy is cancelled meanwhile (Esc).
    if (pendingTap.current !== null) return true;
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY;
    const chosen = { placing, boxCopy };
    const done = () => {
      pendingTap.current = null;
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      done();
      const still = chosenNow.current.placing === chosen.placing && chosenNow.current.boxCopy === chosen.boxCopy;
      if (still && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) put(ev.clientX, ev.clientY);
    };
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === id) done(); };
    pendingTap.current = id;
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return true;
  }

  function draw(entry: PaletteEntry, page: number, at?: { x: number; y: number }) {
    if (!onDrawElement) return;
    const dims = entry.size ?? DEFAULT_SIZE[entry.stamp.kind];
    const pg = pages[page]!;
    // A new element lands under the selected one (or under the last one added on that page).
    const onPage = latest.current.stamps.filter((o) => o.page === page && o.id !== selected);
    const anchor = latest.current.stamps.find((o) => o.id === selected && o.page === page);
    const pos = at ?? nextFreePosition(dims, pg, anchor ? [...onPage, anchor] : onPage);
    const box = clampBox(at ? besideText(page, { ...pos, ...dims }) : { ...pos, ...dims }, pg.width, pg.height);
    pushHistory();
    const id = onDrawElement(entry, page, { x: round1(box.x), y: round1(box.y) });
    select(id);
    reveal(id);
  }

  function startDrag(e: React.PointerEvent, stamp: PdfStamp, mode: "move" | "resize") {
    e.preventDefault();
    if (putChosenAt(e, stamp.page)) { e.stopPropagation(); return; }
    e.stopPropagation();
    // preventDefault stops the browser focusing the stamp, so keep keyboard shortcuts working explicitly.
    rootRef.current?.focus({ preventScroll: true });
    if (mode === "move" && pick) {
      pick.onToggle(baseFieldId(stamp.fieldId));
      return;
    }
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
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const origins = new Map(latest.current.stamps.filter((s) => moving.includes(s.id)).map((s) => [s.id, { x: s.x, y: s.y, width: s.width, height: s.height, page: s.page }]));
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 3) return;
      // An undo step only when the box really moves: a plain click (selecting it) is not one.
      if (!moved) pushHistory();
      moved = true;
      const dx = (ev.clientX - startX) / scale;
      const dy = -(ev.clientY - startY) / scale; // screen down = PDF down
      const patches = new Map<string, Partial<PdfStamp>>();
      const hit: { page: number; axis: "x" | "y"; at: number }[] = [];
      let textHit: { page: number; text: TextAnchor } | null = null;
      for (const [id, origin] of origins) {
        const pg = pages[origin.page]!;
        let box = mode === "move"
          ? { ...origin, x: origin.x + dx, y: origin.y + dy }
          // Resize from the bottom-end corner: width grows with dx, the top edge stays put.
          : { x: origin.x, width: origin.width + dx, height: origin.height - dy, y: origin.y + dy };
        // Alt drags freely, without lining up with anything.
        if (mode === "move" && origins.size === 1 && !ev.altKey) {
          const others = latest.current.stamps.filter((o) => o.id !== id && o.page === origin.page);
          const snapped = snapPosition(box, others);
          // A printed name on the box's row wins: same height as the name, flush against it.
          const byText = snapToText(box, textsRef.current[origin.page] ?? []);
          const xFromText = byText.guides.some((g) => g.axis === "x");
          box = { ...box, x: xFromText ? byText.x : snapped.x, y: byText.text ? byText.y : snapped.y };
          hit.push(...[...byText.guides, ...snapped.guides.filter((g) => (g.axis === "x" ? !xFromText : !byText.text))].map((g) => ({ ...g, page: origin.page })));
          textHit = byText.text ? { page: origin.page, text: byText.text } : null;
        }
        const c = clampBox(box, pg.width, pg.height);
        // Touching a suggested placement confirms it.
        patches.set(id, { x: round1(c.x), y: round1(c.y), width: round1(c.width), height: round1(c.height), guessed: undefined });
      }
      setGuides(hit);
      setSnapText(textHit);
      onMappingChange({ ...latest.current, stamps: latest.current.stamps.map((s) => (patches.has(s.id) ? { ...s, ...patches.get(s.id) } : s)) });
    };
    const up = () => {
      setGuides([]);
      setSnapText(null);
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
  const latestDef = useRef(definition);
  useEffect(() => { latest.current = mapping; latestDef.current = definition; });
  const now = (withDefinition: boolean): Snapshot => ({ mapping: latest.current, ...(withDefinition ? { definition: latestDef.current } : {}) });
  const textsRef = useRef(texts);
  useEffect(() => { textsRef.current = texts; });

  const selectedBoxes = () => group.map((id) => mapping.stamps.find((s) => s.id === id)!).filter(Boolean);
  function arrange(kind: AlignMode | "dist-x" | "dist-y") {
    const list = selectedBoxes();
    if (list.length < 2) return;
    const pos = kind === "dist-x" ? distributeBoxes(list, "x") : kind === "dist-y" ? distributeBoxes(list, "y") : alignBoxes(list, kind);
    patchMany(new Map(list.map((s, i) => [s.id, { x: round1(pos[i]!.x), y: round1(pos[i]!.y) }])));
  }
  /** Go back (or forward) to a snapshot: the form too when it changed since, as one editor step. */
  function restore(to: Snapshot) {
    if (onTransform && to.definition) { const def = to.definition; onTransform(() => ({ def, stamps: to.mapping.stamps })); }
    else onMappingChange(to.mapping);
  }
  function undo() {
    const h = history.current;
    const prev = h.past.at(-1);
    if (!prev) return;
    h.past = h.past.slice(0, -1);
    h.future = [now(!!prev.definition), ...h.future];
    restore(prev);
    select(null);
  }
  function redo() {
    const h = history.current;
    const next = h.future[0];
    if (!next) return;
    h.future = h.future.slice(1);
    h.past = [...h.past, now(!!next.definition)];
    restore(next);
  }
  function paste() {
    if (clipboard.current.length === 0) return;
    const copies = addCopies(clipboard.current.map((s) => {
      const pg = pages[s.page]!;
      const c = clampBox({ ...s, x: s.x + 12, y: s.y - 12 }, pg.width, pg.height);
      return { ...s, x: round1(c.x), y: round1(c.y) };
    }));
    // Shift the clipboard so repeated pastes cascade, still copying the original fields (a pasted copy may be undone).
    clipboard.current = copies.map((c, i) => ({ ...c, fieldId: clipboard.current[i]!.fieldId }));
    setSelected(copies[0]!.id);
    setExtra(copies.slice(1).map((c) => c.id));
    reveal(copies[0]!.id);
  }

  function onKey(e: React.KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Escape" && (boxCopy || placing)) { e.preventDefault(); setBoxCopy(null); setPlacing(null); return; }
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

  return (
    <div ref={rootRef} tabIndex={-1} className="grid gap-4 outline-none lg:grid-cols-[18rem_1fr_16rem]" onKeyDown={onKey}>
      {/* Fields to place */}
      <aside className="order-2 space-y-3 lg:order-none lg:max-h-[75vh] lg:overflow-auto" aria-label="סוגי שדות">
        <h3 className="text-sm font-semibold">סוגי שדות</h3>
        {guessedCount > 0 && (
          <div role="status" className="space-y-2 rounded-md border border-dashed border-primary bg-primary/5 p-2 text-xs">
            <p>{guessedCount} שיבוצים הוצעו אוטומטית (מסומנים בקו מקווקו). גרירה או שינוי גודל מאשרים שיבוץ.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setStamps(mapping.stamps.map((s) => (s.guessed ? { ...s, guessed: undefined } : s)))}>אישור כל ההצעות</Button>
              <Button size="sm" variant="ghost" onClick={() => setStamps(mapping.stamps.filter((s) => !s.guessed))}>הסרת ההצעות</Button>
            </div>
          </div>
        )}
        {onDrawElement && (
          <section aria-label="סוגי שדות להוספה" className="space-y-3">
            {pdfPaletteGroups().map((g) => (
              <div key={g.label}>
                <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{g.label}</h3>
                <ul className="grid grid-cols-2 gap-1.5">
                  {g.entries.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData(ELEMENT_DRAG, entry.id); e.dataTransfer.effectAllowed = "copy"; }}
                        onClick={() => { setBoxCopy(null); setPlacing(placing?.id === entry.id ? null : entry); }}
                        aria-label={`הוספת ${entry.label}`}
                        aria-pressed={placing?.id === entry.id}
                        className={cn(
                          "flex min-h-10 w-full items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-start text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                          placing?.id === entry.id && "border-primary bg-primary/10 ring-1 ring-primary",
                        )}
                      >
                        {entry.fieldType ? <FieldIcon type={entry.fieldType} className="size-4 shrink-0 text-muted-foreground" /> : <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                        <span className="truncate">{entry.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
          {focusRole === undefined && <label className="flex items-center gap-1 text-xs text-muted-foreground">
            צפה כ-
            <Select className="h-8 w-32" aria-label="צפה כתפקיד" value={viewAs} onChange={(e) => setViewAs(e.target.value as FillerRole | "")}>
              <option value="">כולם</option>
              {fillerRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </label>}
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
        {viewAs && rolesUsed.length > 0 && (
          <ul aria-label="מקרא תפקידים" className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <li className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-success" />{viewAs === "unassigned" ? "לא משויכים לשלב" : `בשלב: ${roleName(viewAs)}`}</li>
            <li className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-primary/40" />בשלבים אחרים</li>
          </ul>
        )}
        {placing && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <Plus className="size-4 text-primary" aria-hidden />
            <span>לחצו במסמך במקום שבו להציב <bdi className="font-medium">{placing.label}</bdi>.</span>
            <Button variant="outline" size="sm" onClick={() => { draw(placing, activePage); setPlacing(null); }}>במקום פנוי בעמוד</Button>
            <Button variant="ghost" size="sm" onClick={() => setPlacing(null)}>ביטול (Esc)</Button>
          </div>
        )}
        {boxCopy && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <Copy className="size-4 text-primary" aria-hidden />
            <span>הועתקה התיבה <bdi className="font-medium">{labelOf(boxCopy)}</bdi>. לחצו במסמך במקום שבו להדביק אותה.</span>
            <Button variant="ghost" size="sm" onClick={() => setBoxCopy(null)}>ביטול (Esc)</Button>
          </div>
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
                className={cn("relative mx-auto shadow", boxCopy && "cursor-copy", placing && "cursor-crosshair")}
                style={{ width: pg.width * scale, height: pg.height * scale }}
                onPointerDown={(e) => {
                  setActivePage(pi);
                  if (putChosenAt(e, pi)) return;
                  select(null);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const entry = pdfPaletteEntry(e.dataTransfer.getData(ELEMENT_DRAG));
                  if (entry) {
                    setPlacing(null);
                    drawAtPointer(entry, pi, e.clientX, e.clientY);
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
                        // One colour for every box; the step chosen above stands out in green, the rest fade.
                        viewAs && inViewStep(s)
                          ? (inGroup ? "border-success bg-success/30" : "border-success bg-success/15")
                          : inGroup ? ROLE_OVERLAY.none.boxActive : ROLE_OVERLAY.none.box,
                        orphans.includes(s) && "border-destructive bg-destructive/15",
                        s.guessed && "border-dashed",
                        viewAs && shownRole(s) !== "none" && !inViewStep(s) && !inGroup && "opacity-25",
                        viewAs && inViewStep(s) && "ring-2 ring-success ring-offset-1",
                        pick && baseFieldId(s.fieldId) === pick.sourceId && "cursor-default border-success bg-success/25 ring-2 ring-success ring-offset-1",
                        pick && pick.ids.has(baseFieldId(s.fieldId)) && "cursor-pointer border-primary bg-primary/30 ring-2 ring-primary ring-offset-1",
                        pick && baseFieldId(s.fieldId) !== pick.sourceId && !pick.ids.has(baseFieldId(s.fieldId)) && "cursor-pointer opacity-50 hover:opacity-100",
                      )}
                      aria-pressed={pick && baseFieldId(s.fieldId) !== pick.sourceId ? pick.ids.has(baseFieldId(s.fieldId)) : undefined}
                      style={{ left: b.x, top: b.y, width: b.width, height: b.height }}
                    >
                      <span className="pointer-events-none block truncate px-0.5 text-primary" title={chipOf(s)}>{chipOf(s)}</span>
                      {active && !pick && (
                        <button
                          type="button"
                          aria-label="העתקת התיבה"
                          aria-pressed={boxCopy?.id === s.id}
                          title="העתקה: אחר כך לוחצים במקום במסמך, ושם יודבק שדה חדש זהה"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); setPlacing(null); setBoxCopy(boxCopy?.id === s.id ? null : s); }}
                          className={cn(
                            "absolute top-0 -start-5 flex size-4 items-center justify-center rounded-sm border border-primary/50 bg-card text-primary hover:border-primary focus-visible:outline-2 focus-visible:outline-ring",
                            boxCopy?.id === s.id && "border-primary bg-primary text-primary-foreground",
                          )}
                        >
                          <Copy className="size-2.5" aria-hidden />
                        </button>
                      )}
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
                {snapText?.page === pi && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute rounded-sm bg-primary/15 ring-1 ring-primary"
                    style={{ left: (snapText.text.x - 2) * scale, top: (pg.height - snapText.text.y - snapText.text.height * 0.85) * scale, width: (snapText.text.width + 4) * scale, height: snapText.text.height * 1.15 * scale }}
                  />
                )}
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
              {fieldOf(selectedStamp) ? FIELD_TYPE_META[fieldOf(selectedStamp)!.type].label : labelOf(selectedStamp)}
              {fieldOf(selectedStamp) && (selectedStamp.part || selectedStamp.whenValue) ? ` · ${labelOf(selectedStamp)}` : ""} · <bdi dir="ltr">{selectedStamp.fieldId}{selectedStamp.part ? `.${selectedStamp.part}` : ""}</bdi>
            </p>
            {onFieldPatch && fieldOf(selectedStamp) && (
              <StampFieldControls
                field={fieldOf(selectedStamp)!}
                stamp={selectedStamp}
                placed={(value) => stampByKey.has(stampKey({ fieldId: selectedStamp.fieldId, whenValue: value }))}
                onFieldPatch={(patch) => onFieldPatch(selectedStamp.fieldId, patch)}
                definition={definition}
                onTransform={onTransform}
                orgFields={orgFields}
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
            {onFieldPatch && !["date_signed", "stamp_image"].includes(selectedStamp.kind) && (
              <div className="space-y-1">
                <Label className="text-muted-foreground">{group.length > 1 ? `באיזה שלב (${group.length} תיבות מסומנות)` : "באילו שלבים השדה פתוח לעריכה"}</Label>
                {group.length <= 1 && fieldOf(selectedStamp) ? (
                  <StepChecks views={steps} field={fieldOf(selectedStamp)!} onChange={(patch) => onFieldPatch(fieldOf(selectedStamp)!.id, patch)} />
                ) : (
                <Select
                  className="h-9"
                  aria-label={`באיזה שלב (${group.length} תיבות מסומנות)`}
                  value=""
                  onChange={(e) => {
                    // Every marked box (Shift/Ctrl+click) goes to the chosen step(s) together.
                    const key = e.target.value;
                    if (!key) return;
                    const ids = new Set(group.map((g) => mapping.stamps.find((x) => x.id === g)).filter((x): x is PdfStamp => !!x).map((x) => baseFieldId(x.fieldId)));
                    for (const fid of ids) if (allFields(definition).some((f) => f.id === fid)) onFieldPatch(fid, comboPatch(key));
                  }}
                >
                  <option value="">בחרו שלבים לכולן…</option>
                  {stepComboOptions(definition, steps).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </Select>
                )}
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
              title="שדה חדש זהה (אותו סוג, שם והגדרות). אחרי ההעתקה לוחצים במקום במסמך שבו להדביק אותו."
              aria-pressed={boxCopy?.id === selectedStamp.id}
              onClick={() => { setPlacing(null); setBoxCopy(boxCopy?.id === selectedStamp.id ? null : selectedStamp); }}
            >
              <Copy className="size-4" aria-hidden />
              העתקת התיבה
            </Button>
            {(() => {
              // The field's last box on the document takes the field with it (the PDF and the form are one); a copy only goes itself.
              const boxes = mapping.stamps.filter((x) => baseFieldId(x.fieldId) === baseFieldId(selectedStamp.fieldId)).length;
              const last = boxes <= 1 && !!fieldOf(selectedStamp);
              return (
                <div className="space-y-1">
                  <Button variant="destructive" size="sm" onClick={() => { setStamps(mapping.stamps.filter((s) => s.id !== selectedStamp.id)); setSelected(null); }}>
                    <Trash2 className="size-4" />{last ? "מחיקת השדה" : "הסרת התיבה הזו"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {last ? "השדה יימחק מהטופס כולו (גם מהטופס הרספונסיבי). ביטול (Ctrl+Z) מחזיר אותו." : `לשדה יש עוד ${boxes - 1 === 1 ? "תיבה אחת" : `${boxes - 1} תיבות`} על המסמך; רק התיבה הזו תוסר.`}
                  </p>
                </div>
              );
            })()}
          </>
        )}
        <p className="border-t pt-2 text-xs text-muted-foreground">{mapping.stamps.length} חותמות ממופות</p>
      </aside>
    </div>
  );
}
