"use client";
import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/** Renders one PDF page (1-based) into a canvas at `scale` CSS px per PDF point. */
export function PageCanvas({ doc, pageNumber, scale }: { doc: PDFDocumentProxy; pageNumber: number; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled || !ref.current) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const viewport = page.getViewport({ scale: scale * ratio });
      const canvas = ref.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${viewport.width / ratio}px`;
      canvas.style.height = `${viewport.height / ratio}px`;
      task = page.render({ canvas, viewport });
      try { await task.promise; } catch { /* cancelled by a newer render */ }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, pageNumber, scale]);
  return <canvas ref={ref} aria-label={`עמוד ${pageNumber} ב-PDF`} className="block bg-card" />;
}
