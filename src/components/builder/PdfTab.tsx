"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PdfPlacement } from "@/components/pdf/PdfPlacement";
import { PdfPreview } from "@/components/pdf/PdfPreview";
import { nanoid } from "nanoid";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import { mergeAcroImport, type AcroImport } from "@/lib/pdf/acroform";
import { addPdfOnlyElement, clonePdfOnlyField, dropPdfOnlyField, pdfOnlyFieldOf, restorePdfOnlyField } from "@/lib/forms/pdf-only";
import type { FormDefinition, FormField } from "@/lib/forms/schema";

export interface PdfState {
  file: { id: string; name: string; url: string; pages: { width: number; height: number }[] };
  mapping: PdfMapping;
}

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
  /** Pdf-only fields removed with their stamp, kept so undo can restore them. */
  const dropped = useRef<Map<string, FormField>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState<{ url: string; data: Uint8Array } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [acro, setAcro] = useState<AcroImport | null>(null);
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
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {pdf && acro && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card p-3 text-sm">
          <span>נמצאו {acro.fields.length} שדות אינטראקטיביים בתוך ה-PDF.</span>
          <Button
            size="sm"
            onClick={() => {
              const merged = mergeAcroImport(definition, acro);
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
          onMappingChange={(mapping) => {
            // Deleting a stamp of a drawn-on-PDF field also removes the field it created; undo brings it back.
            const kept = new Set(mapping.stamps.map((st) => st.fieldId));
            let def = defRef.current;
            for (const st of pdf.mapping.stamps) {
              if (kept.has(st.fieldId)) continue;
              const f = pdfOnlyFieldOf(def, st.fieldId);
              if (f) dropped.current.set(f.id, f);
              def = dropPdfOnlyField(def, st.fieldId);
            }
            for (const st of mapping.stamps) {
              const f = dropped.current.get(st.fieldId);
              if (f) def = restorePdfOnlyField(def, f);
            }
            if (def !== defRef.current) changeDefinition(def);
            onChange({ ...pdf, mapping });
          }}
          onFieldPatch={(fieldId, patch) => {
            const d = defRef.current;
            changeDefinition({ ...d, pages: d.pages.map((pg) => ({ ...pg, fields: pg.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) })) });
          }}
          onCloneField={(fieldId) => {
            const r = clonePdfOnlyField(defRef.current, fieldId);
            if (!r) return null;
            changeDefinition(r.definition);
            return r.fieldId;
          }}
          onDrawElement={(entry, page, at) => {
            const { definition: next, stamp } = addPdfOnlyElement(defRef.current, entry, page, at, () => nanoid(8));
            if (next !== defRef.current) changeDefinition(next);
            onChange({ ...pdf, mapping: { ...pdf.mapping, stamps: [...pdf.mapping.stamps, stamp] } });
            return stamp.id;
          }}
          onPreview={preview}
          previewBusy={previewBusy}
        />
      )}
      <Dialog open={!!filled} onClose={() => { if (filled) URL.revokeObjectURL(filled.url); setFilled(null); }} title="תצוגה מקדימה עם נתוני דוגמה" className="h-[90dvh] w-[min(95vw,60rem)]">
        {filled && <PdfPreview data={filled.data} downloadUrl={filled.url} fileName={`${definition.title}.pdf`} />}
      </Dialog>
    </div>
  );
}
