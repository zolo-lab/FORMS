"use client";
import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export type PdfSource = { url: string } | { data: Uint8Array };

/** Loads pdfjs lazily on the client (it needs the DOM) and opens the document. */
export function usePdfDocument(source: PdfSource | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = source ? ("url" in source ? source.url : `data:${source.data.byteLength}`) : "";
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const task = pdfjs.getDocument("url" in source ? { url: source.url } : { data: source.data.slice() });
        loaded = await task.promise;
        if (cancelled) { loaded.destroy(); return; }
        setDoc(loaded);
        setError(null);
      } catch {
        if (!cancelled) setError("לא ניתן להציג את ה-PDF");
      }
    })();
    return () => { cancelled = true; loaded?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the source
  }, [key]);
  return { doc, error };
}
