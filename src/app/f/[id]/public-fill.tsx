"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { OnDocumentFill } from "@/components/pdf/OnDocumentFill";
import { ViewToggle, useFillView } from "@/components/forms/ViewToggle";
import type { Answers } from "@/lib/forms/conditions";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import type { FormDefinition } from "@/lib/forms/schema";
import type { FieldErrors } from "@/lib/forms/validate";
import type { Lookups } from "@/lib/forms/lookups";

type Done = { message?: string; waitingFor: string[]; completed: boolean };

/** The form from its own link: the first step's fields, on the document or as a form, and "שליחה" opens the request. */
export function PublicFill({ formId, definition, role, pdf, lookups }: { formId: string; definition: FormDefinition; role: "requester" | "employee"; pdf?: { url: string; mapping: PdfMapping }; lookups?: Lookups }) {
  const onDocument = !!pdf && pdf.mapping.stamps.length > 0;
  const [mode, setMode] = useFillView(onDocument);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState<Done | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function send(cleaned: Answers) {
    setFailed(null);
    const res = await fetch(`/api/f/${formId}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: cleaned }) });
    const body = (await res.json().catch(() => ({}))) as { errors?: FieldErrors; error?: string } & Partial<Done>;
    if (res.ok) {
      setDone({ message: body.message, waitingFor: body.waitingFor ?? [], completed: !!body.completed });
      return;
    }
    if (body.errors) {
      setErrors(body.errors);
      return;
    }
    setFailed(body.error === "closed" || body.error === "not_public" ? "הטופס כבר לא פתוח למילוי." : "השליחה נכשלה. נסו שוב בעוד רגע.");
  }

  if (done) {
    return (
      <Card className="space-y-2 p-6 text-center" role="status">
        <h1 className="text-xl font-bold">תודה, הפרטים נשלחו</h1>
        {done.message && <p>{done.message}</p>}
        {done.completed && <p className="text-muted-foreground">התהליך כולו הושלם.</p>}
        {!done.completed && done.waitingFor.length > 0 && <p className="text-muted-foreground">השלב הבא: ממתין ל-{done.waitingFor.join(", ")}</p>}
        <p className="text-muted-foreground">אפשר לסגור את הדף.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {onDocument && (
        <div className="flex justify-end">
          <ViewToggle view={mode} onChange={setMode} />
        </div>
      )}
      {failed && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{failed}</p>}
      {mode === "document" && pdf ? (
        <OnDocumentFill
          pdfs={[{ title: definition.title, url: pdf.url, mapping: pdf.mapping }]}
          definition={definition}
          answers={answers}
          onChange={setAnswers}
          role={role}
          errors={errors}
          onErrors={setErrors}
          onSubmit={send}
        />
      ) : (
        <FormRenderer definition={definition} answers={answers} onChange={setAnswers} errors={errors} role={role} onSubmit={send} lookups={lookups} />
      )}
    </div>
  );
}
