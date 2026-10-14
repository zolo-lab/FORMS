"use client";
import { PageCanvas } from "./PageCanvas";
import { usePdfDocument } from "./usePdfDocument";

/**
 * A rendered PDF (all pages, fitted to the width) drawn with pdf.js.
 * Used instead of an <iframe> because embedded browsers and some mobile browsers show a blank frame for blob PDFs.
 * Pages are drawn at a fixed sharp scale and shown at 100% width, so nothing depends on measuring the container
 * (a ResizeObserver reading 0 left the preview empty).
 */
export function PdfPreview({ data, downloadUrl, fileName }: { data: Uint8Array; downloadUrl?: string; fileName?: string }) {
  const { doc, error } = usePdfDocument({ data });
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {downloadUrl && (
        <a href={downloadUrl} download={fileName ?? "preview.pdf"} className="self-start text-sm text-primary underline">הורדת ה-PDF</a>
      )}
      <div dir="ltr" className="min-h-0 flex-1 space-y-3 overflow-auto rounded border bg-muted p-2" data-testid="pdf-preview">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {!doc && !error && <p role="status" className="py-16 text-center text-sm text-muted-foreground">טוען את ה-PDF…</p>}
        {doc && Array.from({ length: doc.numPages }, (_, i) => (
          <div key={i} className="mx-auto max-w-3xl shadow">
            <PageCanvas doc={doc} pageNumber={i + 1} scale={1.5} fit />
          </div>
        ))}
      </div>
    </div>
  );
}
