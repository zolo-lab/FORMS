"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { OnDocumentFill } from "@/components/pdf/OnDocumentFill";
import { PdfPreview } from "@/components/pdf/PdfPreview";
import type { Answers } from "@/lib/forms/conditions";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import type { FormDefinition } from "@/lib/forms/schema";
import type { FieldErrors } from "@/lib/forms/validate";

export interface TestFillPdf {
  fileId: string;
  url: string;
  mapping: PdfMapping;
}

/**
 * Fill a form as a test (nothing is saved). A form on a PDF opens on the document itself, with the fields that were
 * placed on it; "טופס" switches to the question-by-question view. After sending, the PDF filled with exactly these
 * answers is shown (with a download link).
 */
export function FormTestFill({ definition, pdf }: { definition: FormDefinition; pdf?: TestFillPdf }) {
  const onDocument = !!pdf && pdf.mapping.stamps.length > 0;
  const [mode, setMode] = useState<"document" | "form">(onDocument ? "document" : "form");
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState<Answers | null>(null);
  const [filled, setFilled] = useState<{ url: string; data: Uint8Array } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(cleaned: Answers) {
    setDone(cleaned);
    setFilled(null);
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
    <div className="space-y-4">
      {onDocument && (
        <div role="group" aria-label="אופן המילוי" className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">מילוי:</span>
          <Button size="sm" variant={mode === "document" ? "default" : "outline"} onClick={() => setMode("document")}>על גבי המסמך</Button>
          <Button size="sm" variant={mode === "form" ? "default" : "outline"} onClick={() => setMode("form")}>טופס</Button>
        </div>
      )}
      {mode === "document" && pdf ? (
        <OnDocumentFill
          pdfs={[{ title: definition.title, url: pdf.url, mapping: pdf.mapping }]}
          definition={definition}
          answers={answers}
          onChange={setAnswers}
          role="employee"
          errors={errors}
          onErrors={setErrors}
          onSubmit={finish}
        />
      ) : (
        <FormRenderer
          definition={definition}
          answers={answers}
          onChange={setAnswers}
          onSubmit={finish}
          onUpload={async (f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size, mime: f.type })}
        />
      )}
      {done && pdf && (
        <section aria-label="ה-PDF הממולא" className="space-y-3">
          <h2 className="font-semibold">ה-PDF ממולא בתשובות האלה</h2>
          {busy && <p role="status" className="text-sm text-muted-foreground">מכין את ה-PDF…</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {filled && (
            <div className="flex h-[80dvh] flex-col">
              <PdfPreview data={filled.data} downloadUrl={filled.url} fileName={`${definition.title}.pdf`} />
            </div>
          )}
        </section>
      )}
      {done && (
        <details open={!pdf}>
          <summary className="cursor-pointer text-sm text-muted-foreground">התשובות כפי שנשמרות (JSON)</summary>
          <pre dir="ltr" className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs" data-testid="result">{JSON.stringify(done, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
