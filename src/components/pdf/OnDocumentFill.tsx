"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { SignaturePicker } from "@/components/forms/fields/signature";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Answers } from "@/lib/forms/conditions";
import type { PdfMapping, PdfStamp } from "@/lib/forms/pdf-mapping";
import { type FillerRole, type FormDefinition, type FormField } from "@/lib/forms/schema";
import { validateAnswers, type FieldErrors } from "@/lib/forms/validate";
import { pdfBoxToScreen } from "@/lib/pdf/coords";
import { evaluateCondition } from "@/lib/forms/conditions";
import { computeFormulas } from "@/lib/forms/compute";
import { withDefaults } from "@/lib/forms/defaults";
import { cellRef, inputAttrs, isLockedOnDocument, readCheck, readText, setStampValue, simpleStamps, stampField, stampValue, writeCheck, writeText } from "@/lib/pdf/on-document";
import { cn } from "@/lib/utils";
import { PageCanvas } from "./PageCanvas";
import { usePdfDocument } from "./usePdfDocument";

export interface OnDocPdf {
  title: string;
  url: string;
  mapping: PdfMapping;
}

interface Props {
  pdfs: OnDocPdf[];
  definition: FormDefinition;
  answers: Answers;
  onChange: (a: Answers) => void;
  role: FillerRole;
  errors: FieldErrors;
  onSubmit: (cleaned: Answers) => void | Promise<void>;
  onErrors: (e: FieldErrors) => void;
}

function PdfPages({ pdf, ...rest }: { pdf: OnDocPdf } & Omit<Props, "pdfs" | "role" | "onSubmit" | "onErrors">) {
  const { doc, error } = usePdfDocument({ url: pdf.url });
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [signing, setSigning] = useState<{ stamp: PdfStamp; field: FormField } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const stamps = useMemo(() => simpleStamps(pdf.mapping, rest.definition), [pdf.mapping, rest.definition]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  // Formula fields are shown computed (the server recomputes them on submit).
  const shown = useMemo(() => computeFormulas(rest.definition, rest.answers, today), [rest.definition, rest.answers, today]);
  const errorFields = new Set(Object.keys(rest.errors).map((k) => k.split(".")[0]));

  function setField(stamp: { fieldId: string }, v: unknown) {
    rest.onChange(setStampValue(rest.answers, stamp, v));
  }

  return (
    <div ref={boxRef} className="space-y-4">
      <h2 className="text-lg font-semibold">{pdf.title}</h2>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {doc &&
        width > 0 &&
        pdf.mapping.pages.map((pg, pageIdx) => {
          const scale = Math.min(width / pg.width, 1.6);
          return (
            <div key={pageIdx} className="relative mx-auto w-fit overflow-hidden rounded-md border" style={{ width: pg.width * scale, height: pg.height * scale }}>
              <PageCanvas doc={doc} pageNumber={pageIdx + 1} scale={scale} />
              {stamps
                .filter((s) => s.page === pageIdx)
                .map((s) => {
                  const field = stampField(rest.definition, s)!;
                  const cell = cellRef(s.fieldId);
                  const b = pdfBoxToScreen(s, pg.height, scale);
                  const value = stampValue(shown, s);
                  const locked = isLockedOnDocument(field, shown);
                  if (!evaluateCondition(field.visibleIf, shown)) return null;
                  if (cell && !evaluateCondition(rest.definition.pages.flatMap((p) => p.fields).find((f) => f.id === cell.table)?.visibleIf, shown)) return null;
                  const invalid = cell ? Object.keys(rest.errors).includes(`${cell.table}.${cell.row}.${cell.col}`) : errorFields.has(s.fieldId);
                  const style = { left: b.x, top: b.y, width: b.width, height: b.height, fontSize: Math.max(9, Math.min(b.height * 0.6, 14)) } as const;
                  const ring = cn("absolute min-w-0 rounded-sm border bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring", invalid ? "border-destructive bg-destructive/10" : "border-primary/40");
                  const label = `${cell ? `שורה ${cell.row + 1} – ` : ""}${field.label}${s.part ? ` – ${s.part}` : ""}`;
                  if (s.kind === "text" || s.kind === "comb" || s.kind === "initials") {
                    const attrs = inputAttrs(field);
                    const narrow = attrs.type === "date" || attrs.type === "time" ? "[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-datetime-edit]:p-0" : "";
                    const comb = s.kind === "comb" ? { maxLength: s.comb?.cells, className: "tracking-[0.35em] text-center" } : { maxLength: undefined, className: "" };
                    const title = s.kind === "initials" ? `${label} (יוצג כראשי תיבות)` : label;
                    return s.multiline ? (
                      <textarea key={s.id} id={`od-${s.id}`} data-field-id={s.fieldId} aria-label={title} disabled={locked} className={cn(ring, "resize-none p-0.5")} style={style}
                        value={readText(field, value, s)} onChange={(e) => setField(s, writeText(field, value, s, e.target.value))} />
                    ) : (
                      <input key={s.id} id={`od-${s.id}`} data-field-id={s.fieldId} aria-label={title} disabled={locked} {...attrs} maxLength={comb.maxLength} className={cn(ring, "px-0.5", narrow, comb.className)} style={style}
                        value={readText(field, value, s)} onChange={(e) => setField(s, writeText(field, value, s, e.target.value))} />
                    );
                  }
                  if (s.kind === "check") {
                    return (
                      <input key={s.id} id={`od-${s.id}`} data-field-id={s.fieldId} type="checkbox" aria-label={label} disabled={locked} className={cn(ring, "accent-primary")} style={style}
                        checked={readCheck(field, value, s)} onChange={(e) => setField(s, writeCheck(field, value, s, e.target.checked))} />
                    );
                  }
                  const image = (value as { image?: string } | undefined)?.image;
                  return (
                    <button key={s.id} id={`od-${s.id}`} data-field-id={s.fieldId} type="button" aria-label={label} className={cn(ring, "flex items-center justify-center text-xs text-primary")} style={style} onClick={() => setSigning({ stamp: s, field })}>
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data URL preview
                        <img src={image} alt="החתימה שלך" className="max-h-full max-w-full object-contain" />
                      ) : (
                        "לחצו לחתימה"
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}
      <Dialog open={!!signing} onClose={() => setSigning(null)} title="חתימה" className="sm:w-[min(92vw,40rem)]">
        {signing && <SignaturePicker onCancel={() => setSigning(null)} onSave={(v) => { setField(signing.stamp, v); setSigning(null); }} />}
      </Dialog>
    </div>
  );
}

/** Fill the form directly on the PDF pages. Shows how many required fields remain and jumps to the next one. */
export function OnDocumentFill({ pdfs, definition, answers: rawAnswers, onChange, role, errors, onSubmit, onErrors }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  // Default values show on the document; setField keeps them in the answers it passes up.
  const answers = useMemo(() => withDefaults(definition, rawAnswers, today), [definition, rawAnswers, today]);
  const result = useMemo(() => validateAnswers(definition, answers, { role }), [definition, answers, role]);
  const remaining = Object.keys(result.errors).length;
  const [busy, setBusy] = useState(false);

  function goNext() {
    const key = Object.keys(result.errors)[0];
    if (!key) return;
    const [firstId, row, col] = key.split(".");
    const sel = row !== undefined && col !== undefined ? `[data-field-id="${firstId}[${row}].${col}"]` : `[data-field-id="${firstId}"]`;
    const el = document.querySelector<HTMLElement>(sel) ?? document.querySelector<HTMLElement>(`[data-field-id^="${firstId}["]`) ?? document.querySelector<HTMLElement>(`[data-field-id="${firstId}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
    onErrors(result.errors);
  }

  async function submit() {
    if (!result.ok) { goNext(); return; }
    setBusy(true);
    try { await onSubmit(result.cleaned); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background/95 py-2 backdrop-blur" role="status">
        <span className="text-sm font-medium">{remaining === 0 ? "כל השדות מולאו" : `נותרו ${remaining} שדות`}</span>
        {remaining > 0 && <Button variant="outline" size="sm" onClick={goNext}>הבא</Button>}
        <Button size="sm" className="ms-auto" disabled={busy} onClick={submit}>שליחה</Button>
      </div>
      {pdfs.map((p) => (
        <PdfPages key={p.url} pdf={p} definition={definition} answers={answers} onChange={onChange} errors={errors} />
      ))}
    </div>
  );
}
