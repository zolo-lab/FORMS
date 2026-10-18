"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createFormFromPdfAction } from "./actions";

const MAX_MB = 4;

/** The one way to start a form: a name and the PDF. The document is read next, on the PDF tab, and its fields are proposed. */
export function NewFormFromPdf() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("בחרו קובץ PDF כדי להתחיל"); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`הקובץ גדול מדי (עד ${MAX_MB}MB)`); return; }
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const up = await fetch("/api/admin/pdf", { method: "POST", body });
      const uploaded = (await up.json()) as { id?: string; name?: string; error?: string; acro?: unknown };
      if (!up.ok || !uploaded.id) { setError(uploaded.error ?? "ההעלאה נכשלה"); return; }
      const made = await createFormFromPdfAction(title || uploaded.name?.replace(/\.pdf$/i, "") || "", uploaded.id, uploaded.acro);
      if (!("id" in made) || !made.id) { setError("error" in made && made.error ? made.error : "יצירת הטופס נכשלה"); return; }
      router.push(`/admin/forms/${made.id}?tab=pdf`);
    } catch {
      setError("ההעלאה נכשלה, בדקו את החיבור ונסו שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <div>
          <h2 className="font-semibold">טופס חדש</h2>
          <p className="text-sm text-muted-foreground">מעלים את המסמך והמערכת קוראת אותו ומציעה שדות. אותם שדות משמשים גם את הטופס הרספונסיבי (נוח בנייד) וגם את המילוי על המסמך.</p>
        </div>
        <div className="grid items-start gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <label htmlFor="new-form-title" className="text-sm font-medium">שם הטופס</label>
            <Input id="new-form-title" placeholder="שם הטופס החדש" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            <p className="text-xs text-muted-foreground">לא חובה, ברירת המחדל היא שם הקובץ.</p>
          </div>
          <div className="space-y-1">
            <label htmlFor="new-form-pdf" className="text-sm font-medium">מסמך PDF</label>
            <label
              htmlFor="new-form-pdf"
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 border-dashed border-primary/40 bg-card px-3 py-2 text-sm transition hover:border-primary focus-within:outline-2 focus-within:outline-ring"
            >
              <FileText className="size-4 shrink-0 text-primary" aria-hidden />
              <span className={fileName ? "truncate" : "text-muted-foreground"}>{fileName || `בחירת קובץ (עד ${MAX_MB}MB)`}</span>
              <input
                id="new-form-pdf"
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="sr-only"
                aria-invalid={!!error}
                aria-describedby={error ? "new-form-error" : "new-form-pdf-help"}
                onChange={(e) => { setFileName(e.target.files?.[0]?.name ?? ""); setError(null); }}
              />
            </label>
            <p id="new-form-pdf-help" className="text-xs text-muted-foreground">PDF עם טקסט (לא סרוק), כדי שאפשר יהיה לזהות בו שדות.</p>
          </div>
          <Button type="submit" disabled={busy} className="min-h-11 sm:mt-6">{busy ? "מעלה ופותח את הטופס…" : "יצירת הטופס"}</Button>
        </div>
        {error && <p id="new-form-error" role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
      </form>
    </Card>
  );
}
