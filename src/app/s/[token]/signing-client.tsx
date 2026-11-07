"use client";
import { useEffect, useRef, useState } from "react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import type { UploadedFile } from "@/components/forms/fields/types";
import { UPLOAD_ERRORS } from "@/lib/forms/upload";
import type { Lookups } from "@/lib/forms/lookups";
import { Button, buttonVariants } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { OnDocumentFill, type OnDocPdf } from "@/components/pdf/OnDocumentFill";
import { FilledDocument } from "@/components/pdf/FilledDocument";
import { canFillOnDocument } from "@/lib/pdf/on-document";
import { ViewToggle, useFillView } from "@/components/forms/ViewToggle";
import type { Answers } from "@/lib/forms/conditions";
import type { FillerRole, FormDefinition } from "@/lib/forms/schema";
import type { FilledItem } from "@/lib/forms/role-view";
import type { FieldErrors } from "@/lib/forms/validate";

interface Props {
  token: string;
  definition: FormDefinition;
  pipeDefinition?: FormDefinition;
  initialAnswers: Answers;
  filled: FilledItem[];
  role: FillerRole;
  subjectName: string;
  action: string;
  /** The step is set to "רק טופס רספונסיבי": no on-document mode. */
  formOnly?: boolean;
  returnTargets?: { id: string; label: string }[];
  pdfDocs?: OnDocPdf[];
  /** Option lists of dynamic sources (group members …), built on the server. */
  lookups?: Lookups;
}


type Panel = null | "decline" | "return" | "delegate";

function ApproverActions({ token, returnTargets, onDone }: { token: string; returnTargets: { id: string; label: string }[]; onDone: (msg: string) => void }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState("");
  const [toStepId, setToStepId] = useState(returnTargets[0]?.id ?? "");
  const [person, setPerson] = useState({ name: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>, doneMsg: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/s/${token}/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) { setPanel(null); onDone(doneMsg); return; }
    const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "";
    setError(ACTION_ERRORS[code] ?? "הפעולה נכשלה. רעננו את הדף ונסו שוב.");
  }

  return (
    <>
      {/* One "דחייה": back to an earlier step for a fix when there is one, otherwise the request is declined. */}
      <Button variant="outline" onClick={() => setPanel(returnTargets.length > 0 ? "return" : "decline")}>דחייה</Button>
      <Button variant="outline" onClick={() => setPanel("delegate")}>העברה לאדם אחר</Button>
      <Dialog open={panel === "decline"} onClose={() => setPanel(null)} title="דחיית הבקשה">
        <div className="space-y-3">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבת הדחייה (חובה)" aria-label="סיבת הדחייה" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy || !reason.trim()} onClick={() => send({ type: "decline", reason }, "הבקשה נדחתה")}>דחייה</Button>
        </div>
      </Dialog>
      <Dialog open={panel === "return"} onClose={() => setPanel(null)} title="דחייה – החזרה לתיקון">
        <div className="space-y-3">
          {returnTargets.length > 1 ? (
            <Select value={toStepId} onChange={(e) => setToStepId(e.target.value)} aria-label="לאיזה שלב להחזיר">
              {returnTargets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">הבקשה תחזור ל{returnTargets[0]?.label} לתיקון.</p>
          )}
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="מה צריך לתקן (חובה)" aria-label="הערה להחזרה" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy || !reason.trim() || !toStepId} onClick={() => send({ type: "return", toStepId, reason }, "הבקשה הוחזרה לתיקון")}>דחייה והחזרה</Button>
        </div>
      </Dialog>
      <Dialog open={panel === "delegate"} onClose={() => setPanel(null)} title="העברה לאדם אחר">
        <div className="space-y-3">
          <Input value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder="שם (חובה)" aria-label="שם" />
          <Input value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} placeholder="דוא״ל" type="email" dir="ltr" aria-label="דוא״ל" />
          <Input value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} placeholder="טלפון" type="tel" inputMode="tel" dir="ltr" aria-label="טלפון" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy || !person.name.trim() || (!person.email.trim() && !person.phone.trim())} onClick={() => send({ type: "delegate", assignee: person }, "הבקשה הועברה")}>העברה</Button>
        </div>
      </Dialog>
    </>
  );
}

const ACTION_ERRORS: Record<string, string> = {
  name_required: "יש להזין שם",
  contact_required: "יש להזין מייל או טלפון של האדם שאליו מעבירים",
  bad_email: "כתובת המייל אינה תקינה",
  bad_phone: "מספר הטלפון אינו תקין",
  closed: "הפעולה כבר בוצעה. רעננו את הדף.",
};

export function SigningClient({ token, definition, pipeDefinition, initialAnswers, filled, role, subjectName, action, formOnly = false, returnTargets = [], pdfDocs = [], lookups }: Props) {
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const hasForm = definition.pages.length > 0;
  // On-document mode when this role has fields on the (single) PDF; the ones without a place are asked after the pages.
  const onDocPdfs = pdfDocs.filter((d) => canFillOnDocument(d.mapping, definition));
  const canOnDoc = !formOnly && hasForm && pdfDocs.length > 0 && onDocPdfs.length === pdfDocs.length && pdfDocs.length === 1;
  const [mode, setMode] = useFillView(canOnDoc);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [done, setDone] = useState<{ message?: string; waitingFor: string[]; completed: boolean } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const first = useRef(true);

  // Autosave 1.5s after the last change (not on first render).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/s/${token}/draft`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [answers, token]);

  async function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/s/${token}/upload`, { method: "POST", body: fd });
    if (!res.ok) {
      const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "";
      throw new Error(UPLOAD_ERRORS[code] ?? "ההעלאה נכשלה");
    }
    return (await res.json()) as UploadedFile;
  }

  async function onSubmit(cleaned: Answers) {
    setProblem(null);
    const res = await fetch(`/api/s/${token}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: cleaned }) });
    if (res.ok) { setDone((await res.json()) as { message?: string; waitingFor: string[]; completed: boolean }); return; }
    if (res.status === 422) { setErrors(((await res.json()) as { errors: FieldErrors }).errors); return; }
    const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    if (code === "released") { setProblem("חבר אחר בצוות כבר חתם על הטופס הזה בזמן שמילאתם אותו, ואין צורך לשלוח. תודה!"); return; }
    setProblem("לא ניתן היה לשלוח. ייתכן שהקישור כבר אינו פעיל – רעננו את הדף.");
  }

  if (done || doneMsg) {
    return (
      <Card className="space-y-2 p-6 text-center" role="status">
        <h1 className="text-xl font-bold">{doneMsg ?? "תודה, הפרטים נשלחו"}</h1>
        {done?.message && <p>{done.message}</p>}
        {done?.completed && <p className="text-muted-foreground">התהליך כולו הושלם.</p>}
        {done && !done.completed && done.waitingFor.length > 0 && (
          <p className="text-muted-foreground">השלב הבא: ממתין ל-{done.waitingFor.join(", ")}</p>
        )}
        <p className="text-muted-foreground">אפשר לסגור את הדף.</p>
      </Card>
    );
  }

  // "דחייה" / "העברה לאדם אחר" sit on the same line as "שליחה", next to it.
  const stepActions = action === "approve" ? <ApproverActions token={token} returnTargets={returnTargets} onDone={setDoneMsg} /> : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">עבור: {subjectName}</p>
        {canOnDoc && <ViewToggle view={mode} onChange={setMode} />}
      </div>
      {/* The document as filled so far, with the earlier steps' signatures – mainly for whoever approves it. */}
      {pdfDocs.length > 0 && !(canOnDoc && mode === "document") && (
        <div className="flex flex-wrap gap-2">
          {pdfDocs.map((d) => (
            <a
              key={d.url}
              href={`${d.url}?filled=1`}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: action === "approve" ? "default" : "outline", size: "sm" })}
            >
              <FileText className="size-4" aria-hidden />
              צפייה במסמך{pdfDocs.length > 1 ? `: ${d.title}` : ""}
            </a>
          ))}
        </div>
      )}
      {/* On the document, earlier answers sit in their own places; the separate list is only for the question view. */}
      {filled.length > 0 && !(hasForm && canOnDoc && mode === "document") && (
        <Card className="space-y-2 p-4" aria-label="פרטים שמולאו">
          <h2 className="font-semibold">פרטים שמולאו</h2>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {filled.map((f) => (
              <div key={f.id} className="flex gap-2">
                <dt className="text-muted-foreground">{f.label}:</dt>
                <dd>{f.text}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      {hasForm && canOnDoc && mode === "document" ? (
        <OnDocumentFill pdfs={onDocPdfs} definition={definition} answers={answers} onChange={setAnswers} role={role} errors={errors} onSubmit={onSubmit} onErrors={setErrors} filled={filled} actions={stepActions} lookups={lookups} onUpload={upload} />
      ) : hasForm ? (
        <FormRenderer definition={definition} pipeDefinition={pipeDefinition} answers={answers} onChange={setAnswers} errors={errors} role={role} onSubmit={onSubmit} lookups={lookups} onUpload={upload} actions={stepActions} />
      ) : (
        <>
          {/* Nothing to fill in this step: look over the document as filled so far, and pass it on. */}
          {pdfDocs.map((d) => <FilledDocument key={d.url} url={`${d.url}?filled=1`} title={d.title} />)}
          <Card className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 p-3 shadow-lg">
            <p className="w-full text-sm text-muted-foreground">
              {action === "approve" ? "בשלב הזה אין מה למלא: עברו על המסמך, ואם הכל תקין – אשרו והוא יעבור לשלב הבא." : "אין בשלב הזה מה למלא."}
            </p>
            <Button className="min-w-40" onClick={() => onSubmit({})}>{action === "approve" ? "הכל תקין – אישור והעברה" : "המשך"}</Button>
            {stepActions}
          </Card>
        </>
      )}
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {saveState === "saving" && "שומר…"}
        {saveState === "saved" && "נשמר אוטומטית"}
        {saveState === "error" && "השמירה האוטומטית נכשלה"}
      </p>
    </div>
  );
}
