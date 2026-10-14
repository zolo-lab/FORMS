"use client";
import { useEffect, useState } from "react";
import type { PDFDocumentProxy, PDFWorker } from "pdfjs-dist";

export type PdfSource = { url: string } | { data: Uint8Array };

/**
 * One worker for every document on the page. Each worker numbers its documents from 0 and pdf.js registers fonts
 * as "g_d<doc>_f<n>", so two documents in two workers (the editor and the filled preview, or a replaced PDF) both
 * got "g_d0_f1": the second one drew text with the first one's glyphs (letters went missing).
 */
let sharedWorker: PDFWorker | null = null;

/** Loads pdfjs lazily on the client (it needs the DOM) and opens the document. */
export function usePdfDocument(source: PdfSource | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = source ? ("url" in source ? source.url : `data:${source.data.byteLength}`) : "";
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        sharedWorker ??= new pdfjs.PDFWorker({ name: "gybs-pdf" });
        const loading = pdfjs.getDocument({ ...("url" in source ? { url: source.url } : { data: source.data.slice() }), worker: sharedWorker });
        task = loading;
        const loaded = await loading.promise;
        if (cancelled) { void loading.destroy(); return; }
        setDoc(loaded);
        setError(null);
      } catch {
        if (!cancelled) setError("לא ניתן להציג את ה-PDF");
      }
    })();
    return () => { cancelled = true; void task?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the source
  }, [key]);
  return { doc, error };
}
