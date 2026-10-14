"use client";
import { useEffect, useRef, useState } from "react";
import { PageCanvas } from "./PageCanvas";
import { usePdfDocument } from "./usePdfDocument";

/**
 * A rendered PDF (all pages, fitted to the width) drawn with pdf.js.
 * Used instead of an <iframe> because embedded browsers and some mobile browsers show a blank frame for blob PDFs.
 */
export function PdfPreview({ data, downloadUrl, fileName }: { data: Uint8Array; downloadUrl?: string; fileName?: string }) {
  const { doc, error } = usePdfDocument({ data });
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    void Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1).then((p) => {
      const v = p.getViewport({ scale: 1 });
      return { width: v.width, height: v.height };
    }))).then((s) => { if (!cancelled) setSizes(s); });
    return () => { cancelled = true; };
  }, [doc]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {downloadUrl && (
        <a href={downloadUrl} download={fileName ?? "preview.pdf"} className="self-start text-sm text-primary underline">הורדת ה-PDF</a>
      )}
      <div ref={box} className="min-h-0 flex-1 space-y-3 overflow-auto rounded border bg-muted p-2" data-testid="pdf-preview">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {!doc && !error && <p role="status" className="py-16 text-center text-sm text-muted-foreground">טוען את ה-PDF…</p>}
        {doc && width > 0 && sizes.map((s, i) => (
          <div key={i} className="mx-auto shadow" style={{ width: Math.floor(s.width * ((width - 16) / s.width)) }}>
            <PageCanvas doc={doc} pageNumber={i + 1} scale={(width - 16) / s.width} />
          </div>
        ))}
      </div>
    </div>
  );
}
