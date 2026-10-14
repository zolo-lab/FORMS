"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { PdfPreview } from "@/components/pdf/PdfPreview";
import type { Answers } from "@/lib/forms/conditions";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import type { FormDefinition } from "@/lib/forms/schema";

/** Fill the form as a test; when it has a PDF, see that PDF filled with exactly these answers. */
export function FormPreview({ definition, pdf }: { definition: FormDefinition; pdf?: { fileId: string; mapping: PdfMapping } }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [done, setDone] = useState<Answers | null>(null);
  const [filled, setFilled] = useState<{ url: string; data: Uint8Array } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function showPdf(cleaned: Answers) {
    if (!pdf) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pdf-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pdfFileId: pdf.fileId, definition, mapping: pdf.mapping, answers: cleaned }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "יצירת ה-PDF נכשלה"); return; }
      const blob = await res.blob();
      setFilled({ url: URL.createObjectURL(blob), data: new Uint8Array(await blob.arrayBuffer()) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FormRenderer
        definition={definition}
        answers={answers}
        onChange={setAnswers}
        onSubmit={(cleaned) => { setDone(cleaned); setFilled(null); }}
        onUpload={async (f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size, mime: f.type })}
      />
      {done && pdf && (
        <section aria-label="ה-PDF הממולא" className="mt-6 space-y-3">
          {!filled && <Button disabled={busy} onClick={() => showPdf(done)}>{busy ? "מכין…" : "הצגת ה-PDF ממולא בתשובות האלה"}</Button>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {filled && (
            <div className="flex h-[80dvh] flex-col">
              <PdfPreview data={filled.data} downloadUrl={filled.url} fileName={`${definition.title}.pdf`} />
            </div>
          )}
        </section>
      )}
      {done && (
        <details className="mt-6" open={!pdf}>
          <summary className="cursor-pointer text-sm text-muted-foreground">התשובות כפי שנשמרות (JSON)</summary>
          <pre dir="ltr" className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs" data-testid="result">
            {JSON.stringify(done, null, 2)}
          </pre>
        </details>
      )}
    </>
  );
}
