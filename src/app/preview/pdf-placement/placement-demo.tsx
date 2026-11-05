"use client";
import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { nanoid } from "nanoid";
import { PdfPlacement } from "@/components/pdf/PdfPlacement";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import { addDrawnElement, cloneField } from "@/lib/forms/pdf-draw";
import { sampleForm } from "../../../../tests/fixtures/sample-form";

/** No-database demo: generates a blank A4 PDF in the browser and lets you place sample-form fields on it. */
export function PlacementDemo() {
  const [definition, setDefinitionState] = useState(sampleForm);
  // Several clones in one paste build on each other before React re-renders.
  const defRef = useRef(sampleForm);
  const setDefinition = (next: typeof sampleForm | ((d: typeof sampleForm) => typeof sampleForm)) => {
    defRef.current = typeof next === "function" ? next(defRef.current) : next;
    setDefinitionState(defRef.current);
  };
  const [data, setData] = useState<Uint8Array | null>(null);
  const [mapping, setMapping] = useState<PdfMapping>({ schemaVersion: 1, pages: [{ width: 595.28, height: 841.89 }], stamps: [] });
  useEffect(() => {
    (async () => {
      const doc = await PDFDocument.create();
      doc.addPage([595.28, 841.89]);
      setData(await doc.save());
    })();
  }, []);
  if (!data) return <p>טוען…</p>;
  return (
    <>
      <PdfPlacement
        definition={definition}
        source={{ data }}
        pages={mapping.pages}
        mapping={mapping}
        onMappingChange={setMapping}
        onFieldPatch={(fieldId, patch) =>
          setDefinition((d) => ({ ...d, pages: d.pages.map((pg) => ({ ...pg, fields: pg.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) })) }))
        }
        onCloneField={(fieldId) => {
          const r = cloneField(defRef.current, fieldId);
          if (!r) return null;
          setDefinition(r.definition);
          return r.fieldId;
        }}
        onDrawElement={(entry, page, at) => {
          const r = addDrawnElement(definition, entry, page, at, () => nanoid(8));
          setDefinition(r.definition);
          setMapping((m) => ({ ...m, stamps: [...m.stamps, r.stamp] }));
          return r.stamp.id;
        }}
      />
      <pre dir="ltr" data-testid="mapping" className="mt-4 max-h-60 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(mapping.stamps, null, 1)}</pre>
    </>
  );
}
