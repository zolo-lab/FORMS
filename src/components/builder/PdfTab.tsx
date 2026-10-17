"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PdfPlacement } from "@/components/pdf/PdfPlacement";
import { PdfPreview } from "@/components/pdf/PdfPreview";
import { usePdfDocument } from "@/components/pdf/usePdfDocument";
import { extractPageData } from "@/components/pdf/extract-page-data";
import { guessOne, planGuess, unplacedSimpleFields, type GuessPage } from "@/lib/pdf/guess";
import { detectFields, type DetectedField } from "@/lib/pdf/detect";
import { applyRefinements, type Refinement } from "@/lib/pdf/refine";
import { DetectDialog } from "@/components/pdf/DetectDialog";
import type { Match } from "@/lib/pdf/match";
import { nanoid } from "nanoid";
import type { PdfMapping, PdfStamp } from "@/lib/forms/pdf-mapping";
import { mergeAcroImport, type AcroImport } from "@/lib/pdf/acroform";
import { tableCellOf } from "@/lib/forms/pdf-items";
import { addDetectedFields, addDrawnElement, cloneField, splitStepAt } from "@/lib/forms/pdf-draw";
import { allFields, type FormDefinition, type FormField } from "@/lib/forms/schema";

export interface PdfState {
  file: { id: string; name: string; url: string; pages: { width: number; height: number }[] };
  mapping: PdfMapping;
}

const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

export function PdfTab({
  definition,
  pdf,
  onChange,
  onDefinitionChange,
}: {
  definition: FormDefinition;
  pdf: PdfState | null;
  onChange: (p: PdfState | null) => void;
  onDefinitionChange: (d: FormDefinition) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState<{ url: string; data: Uint8Array } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [acro, setAcro] = useState<AcroImport | null>(null);
  const { doc, docKey } = usePdfDocument(pdf ? { url: pdf.file.url } : null);
  /** Placements the automatic matcher found, waiting for the admin's answer. */
  const [guess, setGuess] = useState<{ total: number; stamps: PdfStamp[] } | null>(null);
  const [guessNote, setGuessNote] = useState<string | null>(null);
  const [guessBusy, setGuessBusy] = useState(false);
  /** The page text and drawing, read once per document (a suggestion for a single field reuses it). */
  const pageData = useRef<{ key: string; pages: Promise<GuessPage[]> } | null>(null);
  const readPages = (): Promise<GuessPage[]> | null => {
    if (!pdf || !doc || docKey !== pdf.file.url) return null;
    if (pageData.current?.key !== pdf.file.url) pageData.current = { key: pdf.file.url, pages: extractPageData(doc, pdf.file.pages) };
    return pageData.current.pages;
  };
  /** Set after an upload: ask about automatic placement as soon as the new document is open. */
  const askAfterUpload = useRef(!!pdf && allFields(definition).length === 0 && pdf.mapping.stamps.length === 0);
  /** Fields the PDF seems to ask for, waiting for the admin's choice. */
  const [found, setFound] = useState<DetectedField[] | null>(null);
  /** Places to write the existing fields did not claim (offered after the placement question). */
  const [extra, setExtra] = useState<DetectedField[]>([]);
  const pending = pdf ? unplacedSimpleFields(definition, pdf.mapping.stamps).length : 0;
  /** Several field changes can happen in one event (paste of 3 elements); each must build on the previous one. */
  const defRef = useRef(definition);
  useEffect(() => { defRef.current = definition; }, [definition]);
  const changeDefinition = (d: FormDefinition) => { defRef.current = d; onDefinitionChange(d); };

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/pdf", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "ההעלאה נכשלה"); return; }
      setAcro(json.acro ?? null);
      askAfterUpload.current = !json.acro;
      setGuess(null);
      setGuessNote(null);
      const same = pdf && pdf.file.pages.length === json.pages.length;
      onChange({
        file: { id: json.id, name: json.name, url: json.url, pages: json.pages },
        // Keep existing stamps when the new PDF has the same page count (e.g. a corrected version of the same form).
        mapping: { schemaVersion: 1, pages: json.pages, stamps: same ? pdf.mapping.stamps : [] },
      });
    } catch {
      setError("ההעלאה נכשלה, נסו שוב");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  /** Read the PDF's text and drawing, match its labels to the unplaced fields and propose positions. */
  async function analyze() {
    if (!pdf || !doc) return;
    setGuessBusy(true);
    setGuessNote(null);
    try {
      const pages = (await readPages()) ?? [];
      if (pages.every((p) => p.labels.length === 0)) { setGuessNote("ה-PDF סרוק או שאין בו טקסט, לכן השיבוץ ידני."); return; }
      // A form with no fields yet: propose them from the document.
      if (allFields(defRef.current).length === 0) {
        let detected = detectFields(pages);
        if (detected.length === 0) { setGuessNote("לא זיהינו ב-PDF מקומות למילוי, לכן בונים ידנית: הוסיפו שדות מהפלטה והציבו אותם על המסמך."); return; }
        try {
          const res = await fetch("/api/admin/pdf-detect", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ fields: detected.map((f) => ({ id: f.id, label: f.label, type: f.type, options: f.options?.map((o) => ({ label: o.label })) })) }),
          });
          if (res.ok) {
            const refinements = ((await res.json()) as { refinements: Refinement[] | null }).refinements;
            if (refinements) detected = applyRefinements(detected, refinements);
          }
        } catch { /* local detection stands */ }
        setFound(detected);
        return;
      }
      const targets = unplacedSimpleFields(defRef.current, pdf.mapping.stamps);
      if (targets.length === 0) { setGuessNote("כל שדות הטופס כבר שובצו."); return; }
      // A language model may pair names with labels (names only, never coordinates); without it the local matcher does.
      let claude: Match[] | null = null;
      try {
        const res = await fetch("/api/admin/pdf-match", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fields: targets.map((f) => ({ id: f.id, type: f.type, label: f.label })),
            labels: pages.flatMap((p) => p.labels).map((l) => ({ id: l.id, text: l.str })),
          }),
        });
        if (res.ok) claude = ((await res.json()) as { matches: Match[] | null }).matches;
      } catch { /* local matcher */ }
      const plan = planGuess(defRef.current, pdf.mapping.stamps, pages, () => nanoid(8), claude);
      // Places to write that neither a placed stamp nor a suggestion covers: candidates for new fields.
      const taken = [...pdf.mapping.stamps, ...plan.stamps];
      setExtra(detectFields(pages).filter((d) => !taken.some((t) => t.page === d.page && overlap(t, d.box) > 0.5)));
      if (plan.stamps.length === 0) { setGuessNote("לא מצאנו ב-PDF תוויות שמתאימות לשדות הטופס, לכן השיבוץ ידני."); return; }
      setGuess({ total: plan.total, stamps: plan.stamps });
    } catch {
      setGuessNote("לא הצלחנו לנתח את ה-PDF, השיבוץ ידני.");
    } finally {
      setGuessBusy(false);
    }
  }

  // After an upload the question comes up once the new document (not the previous one) is open.
  useEffect(() => {
    if (askAfterUpload.current && pdf && doc && docKey === pdf.file.url) {
      askAfterUpload.current = false;
      void analyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the document finishes loading
  }, [doc, docKey, pdf?.file.url]);

  async function preview() {
    if (!pdf) return;
    setPreviewBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pdf-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pdfFileId: pdf.file.id, definition, mapping: pdf.mapping }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "יצירת התצוגה נכשלה"); return; }
      const blob = await res.blob();
      setFilled({ url: URL.createObjectURL(blob), data: new Uint8Array(await blob.arrayBuffer()) });
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
        <Button variant={pdf ? "outline" : "default"} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "מעלה…" : pdf ? "החלפת PDF" : "העלאת PDF"}
        </Button>
        {pdf && <span className="text-sm text-muted-foreground"><bdi>{pdf.file.name}</bdi> · {pdf.file.pages.length} עמודים</span>}
        {pdf && <Button variant="ghost" size="sm" onClick={() => onChange(null)}>הסרת ה-PDF מהטופס</Button>}
        {pdf && pending === 0 && allFields(definition).length === 0 && (
          <Button variant="outline" size="sm" disabled={!doc || guessBusy} onClick={() => void analyze()}>
            {guessBusy ? "מנתח את ה-PDF…" : "זיהוי שדות מה-PDF"}
          </Button>
        )}
        {pdf && pending > 0 && (
          <Button variant="outline" size="sm" disabled={!doc || guessBusy} onClick={() => void analyze()}>
            {guessBusy ? "מנתח את ה-PDF…" : `שיבוץ אוטומטי של ${pending} שדות ממתינים`}
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {guessNote && <p role="status" className="text-sm text-muted-foreground">{guessNote}</p>}
      {pdf && acro && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card p-3 text-sm">
          <span>נמצאו {acro.fields.length} שדות אינטראקטיביים בתוך ה-PDF.</span>
          <Button
            size="sm"
            onClick={() => {
              const merged = mergeAcroImport(definition, acro, pdf.mapping.stamps);
              onDefinitionChange(merged.definition);
              onChange({ ...pdf, mapping: { ...pdf.mapping, stamps: [...pdf.mapping.stamps, ...merged.stamps], acroImported: true } });
              setAcro(null);
            }}
          >
            ייבוא השדות לטופס
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAcro(null)}>התעלמות</Button>
        </div>
      )}
      {!pdf && <p className="text-sm text-muted-foreground">העלו PDF של הטופס (עד 4MB), ואז הצמידו אליו את שדות הטופס. כך נוצר PDF ממולא וחתום.</p>}
      {pdf && (
        <PdfPlacement
          definition={definition}
          source={{ url: pdf.file.url }}
          pages={pdf.file.pages}
          mapping={pdf.mapping}
          onMappingChange={(mapping) => onChange({ ...pdf, mapping })}
          onSplitStep={(fieldId) => {
            const r = splitStepAt(defRef.current, fieldId);
            if (!r) { setGuessNote("זה כבר תחילת שלב, אין מה לחתוך."); return; }
            changeDefinition(r.definition);
            setGuessNote(`נוצר שלב חדש (${r.definition.pages[r.step]!.title}). אפשר לשנות לו שם בלשונית העריכה.`);
          }}
          onSuggest={async (fieldId) => {
            try {
              const pages = await readPages();
              return pages ? guessOne(defRef.current, fieldId, pdf.mapping.stamps, pages, () => nanoid(8)) : null;
            } catch {
              return null;
            }
          }}
          onFieldPatch={(fieldId, patch) => {
            const d = defRef.current;
            // A table cell ("children[0].birth") edits its column.
            const cell = tableCellOf(fieldId);
            const apply = (f: FormField): FormField => {
              if (cell) return f.id === cell.table ? { ...f, fields: f.fields?.map((c) => (c.id === cell.column ? { ...c, ...patch } : c)) } : f;
              return f.id === fieldId ? { ...f, ...patch } : f;
            };
            changeDefinition({ ...d, pages: d.pages.map((pg) => ({ ...pg, fields: pg.fields.map(apply) })) });
          }}
          onCloneField={(fieldId) => {
            const r = cloneField(defRef.current, fieldId);
            if (!r) return null;
            changeDefinition(r.definition);
            return r.fieldId;
          }}
          onDrawElement={(entry, page, at) => {
            const { definition: next, stamp } = addDrawnElement(defRef.current, entry, page, at, () => nanoid(8), pdf.mapping.stamps);
            if (next !== defRef.current) changeDefinition(next);
            onChange({ ...pdf, mapping: { ...pdf.mapping, stamps: [...pdf.mapping.stamps, stamp] } });
            return stamp.id;
          }}
          onPreview={preview}
          previewBusy={previewBusy}
        />
      )}
      <DetectDialog
        fields={found}
        pageCount={pdf?.file.pages.length ?? 1}
        canSplit={allFields(definition).length === 0 && (pdf?.file.pages.length ?? 1) > 1}
        onClose={() => setFound(null)}
        onConfirm={(chosen, opts) => {
          if (!pdf) return;
          const added = addDetectedFields(defRef.current, chosen, pdf.mapping.stamps, () => nanoid(8), opts);
          changeDefinition(added.definition);
          onChange({ ...pdf, mapping: { ...pdf.mapping, stamps: [...pdf.mapping.stamps, ...added.stamps] } });
          setFound(null);
          setExtra([]);
        }}
      />
      <Dialog open={!!guess} onClose={() => setGuess(null)} title="שיבוץ אוטומטי של השדות" className="w-[min(92vw,30rem)]">
        {guess && (
          <div className="space-y-4 text-sm">
            <p>
              מצאנו ב-PDF מקום ל-<b>{guess.stamps.length}</b> מתוך {guess.total} שדות. השיבוצים יסומנו בקו מקווקו, ואפשר להזיז, לשנות או למחוק אותם. שדות שלא נמצא להם מקום נשארים ברשימת &quot;ממתינים לשיבוץ&quot;.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (pdf) onChange({ ...pdf, mapping: { ...pdf.mapping, stamps: [...pdf.mapping.stamps, ...guess.stamps] } });
                  setGuess(null);
                }}
              >
                לשבץ אוטומטית
              </Button>
              <Button variant="outline" onClick={() => setGuess(null)}>אשבץ ידנית</Button>
              {extra.length > 0 && (
                <Button variant="ghost" onClick={() => { setFound(extra); setGuess(null); }}>נמצאו עוד {extra.length} מקומות למילוי ללא שדה, להוסיף?</Button>
              )}
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={!!filled} onClose={() => { if (filled) URL.revokeObjectURL(filled.url); setFilled(null); }} title="תצוגה מקדימה עם נתוני דוגמה" className="h-[90dvh] w-[min(95vw,60rem)]">
        {filled && <PdfPreview data={filled.data} downloadUrl={filled.url} fileName={`${definition.title}.pdf`} />}
      </Dialog>
    </div>
  );
}
