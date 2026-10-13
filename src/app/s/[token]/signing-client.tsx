"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { OnDocumentFill, type OnDocPdf } from "@/components/pdf/OnDocumentFill";
import { coversAll } from "@/lib/pdf/on-document";
import type { Answers } from "@/lib/forms/conditions";
import type { FillerRole, FormDefinition } from "@/lib/forms/schema";
import type { FilledItem } from "@/lib/forms/role-view";
import type { FieldErrors } from "@/lib/forms/validate";

interface Props {
  token: string;
  definition: FormDefinition;
  initialAnswers: Answers;
  filled: FilledItem[];
  role: FillerRole;
  subjectName: string;
  action: string;
  returnTargets?: { id: string; label: string }[];
  pdfDocs?: OnDocPdf[];
}

const DESKTOP_QUERY = "(min-width: 1024px)";
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
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
    if (res.ok) { setPanel(null); onDone(doneMsg); } else setError("הפעולה נכשלה. רעננו את הדף ונסו שוב.");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setPanel("decline")}>דחייה</Button>
        {returnTargets.length > 0 && <Button variant="outline" onClick={() => setPanel("return")}>החזרה לשלב קודם</Button>}
        <Button variant="outline" onClick={() => setPanel("delegate")}>העברה לאדם אחר</Button>
      </div>
      <Dialog open={panel === "decline"} onClose={() => setPanel(null)} title="דחיית הבקשה">
        <div className="space-y-3">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבת הדחייה (חובה)" aria-label="סיבת הדחייה" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy || !reason.trim()} onClick={() => send({ type: "decline", reason }, "הבקשה נדחתה")}>דחייה</Button>
        </div>
      </Dialog>
      <Dialog open={panel === "return"} onClose={() => setPanel(null)} title="החזרה לשלב קודם">
        <div className="space-y-3">
          <Select value={toStepId} onChange={(e) => setToStepId(e.target.value)} aria-label="שלב להחזרה">
            {returnTargets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="מה צריך לתקן (חובה)" aria-label="הערה להחזרה" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy || !reason.trim() || !toStepId} onClick={() => send({ type: "return", toStepId, reason }, "הבקשה הוחזרה לתיקון")}>החזרה</Button>
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
    </div>
  );
}

export function SigningClient({ token, definition, initialAnswers, filled, role, subjectName, action, returnTargets = [], pdfDocs = [] }: Props) {
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const hasForm = definition.pages.length > 0;
  // On-document mode only when every field of this role is placed on a PDF.
  const onDocPdfs = pdfDocs.filter((d) => coversAll(d.mapping, definition));
  const canOnDoc = hasForm && pdfDocs.length > 0 && onDocPdfs.length === pdfDocs.length && pdfDocs.length === 1;
  const isDesktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);
  const [chosen, setChosen] = useState<"form" | "document" | null>(null);
  const mode = chosen ?? (isDesktop && canOnDoc ? "document" : "form");
  const setMode = setChosen;
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [done, setDone] = useState(false);
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

  async function onSubmit(cleaned: Answers) {
    setProblem(null);
    const res = await fetch(`/api/s/${token}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: cleaned }) });
    if (res.ok) { setDone(true); return; }
    if (res.status === 422) { setErrors(((await res.json()) as { errors: FieldErrors }).errors); return; }
    setProblem("לא ניתן היה לשלוח. ייתכן שהקישור כבר אינו פעיל – רעננו את הדף.");
  }

  if (done || doneMsg) {
    return (
      <Card className="space-y-2 p-6 text-center" role="status">
        <h1 className="text-xl font-bold">{doneMsg ?? "תודה, הפרטים נשלחו"}</h1>
        <p className="text-muted-foreground">אפשר לסגור את הדף.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">עבור: {subjectName}</p>
      {filled.length > 0 && (
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
      {canOnDoc && (
        <div className="flex gap-2" role="group" aria-label="אופן המילוי">
          <Button size="sm" variant={mode === "document" ? "default" : "outline"} onClick={() => setMode("document")}>על גבי המסמך</Button>
          <Button size="sm" variant={mode === "form" ? "default" : "outline"} onClick={() => setMode("form")}>טופס</Button>
        </div>
      )}
      {hasForm && canOnDoc && mode === "document" ? (
        <OnDocumentFill pdfs={onDocPdfs} definition={definition} answers={answers} onChange={setAnswers} role={role} errors={errors} onSubmit={onSubmit} onErrors={setErrors} />
      ) : hasForm ? (
        <FormRenderer definition={definition} answers={answers} onChange={setAnswers} errors={errors} role={role} onSubmit={onSubmit} />
      ) : (
        <Button className="w-full sm:w-auto" onClick={() => onSubmit({})}>{action === "approve" ? "אישור" : "המשך"}</Button>
      )}
      {action === "approve" && <ApproverActions token={token} returnTargets={returnTargets} onDone={setDoneMsg} />}
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {saveState === "saving" && "שומר…"}
        {saveState === "saved" && "נשמר אוטומטית"}
        {saveState === "error" && "השמירה האוטומטית נכשלה"}
      </p>
    </div>
  );
}
