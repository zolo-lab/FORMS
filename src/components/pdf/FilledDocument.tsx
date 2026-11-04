"use client";
import { useEffect, useRef, useState } from "react";
import { PageCanvas } from "./PageCanvas";
import { usePdfDocument } from "./usePdfDocument";

/**
 * The document as filled so far (earlier answers and signatures stamped on it), page after page, read-only: what a
 * step that only approves looks at before it says "הכל תקין". Fits the width of its container (phone or desktop).
 */
export function FilledDocument({ url, title }: { url: string; title: string }) {
  const { doc, error } = usePdfDocument({ url });
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const [pageWidth, setPageWidth] = useState(595);
  useEffect(() => {
    if (!doc) return;
    let live = true;
    void doc.getPage(1).then((p) => { if (live) setPageWidth(p.getViewport({ scale: 1 }).width); });
    return () => { live = false; };
  }, [doc]);
  const scale = width > 0 ? Math.min(width / pageWidth, 1.6) : 0;
  return (
    <section ref={boxRef} aria-label={`המסמך: ${title}`} className="space-y-3">
      {error && <p role="alert" className="text-sm text-destructive">לא ניתן היה להציג את המסמך. אפשר לפתוח אותו בכפתור &quot;צפייה במסמך&quot;.</p>}
      {!doc && !error && <p className="text-sm text-muted-foreground" aria-live="polite">טוען את המסמך…</p>}
      {doc && scale > 0 &&
        Array.from({ length: doc.numPages }, (_, i) => (
          <div key={i} className="mx-auto w-fit overflow-hidden rounded-md border shadow-sm">
            <PageCanvas doc={doc} pageNumber={i + 1} scale={scale} />
          </div>
        ))}
    </section>
  );
}
