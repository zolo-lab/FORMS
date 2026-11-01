"use client";
import { useRef, useState } from "react";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renderTemplate } from "@/lib/notifications/templates";
import { SAMPLE_VARS, VAR_LABELS } from "@/lib/notifications/triggers";

/**
 * Subject + body of one trigger with its variables: clicking a variable puts it where the cursor is, and the preview
 * below shows the text with example values as it is typed. The surrounding <form> saves it.
 */
export function TemplateEditor({ id, subject: initialSubject, body: initialBody, vars }: { id: string; subject: string; body: string; vars: string[] }) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [lastFocus, setLastFocus] = useState<"subject" | "body">("body");

  function insert(v: string) {
    const token = `{{${v}}}`;
    const el = lastFocus === "subject" ? subjectRef.current : bodyRef.current;
    const value = lastFocus === "subject" ? subject : body;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    if (lastFocus === "subject") setSubject(next);
    else setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const unknown = [...`${subject}\n${body}`.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!).filter((v, i, a) => !vars.includes(v) && a.indexOf(v) === i);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${id}-subject`}>נושא</Label>
        <Input ref={subjectRef} id={`${id}-subject`} name="subject" value={subject} maxLength={200} required onChange={(e) => setSubject(e.target.value)} onFocus={() => setLastFocus("subject")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-body`}>גוף ההודעה</Label>
        <Textarea ref={bodyRef} id={`${id}-body`} name="body" value={body} rows={6} maxLength={5000} required onChange={(e) => setBody(e.target.value)} onFocus={() => setLastFocus("body")} />
      </div>
      {vars.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium" id={`${id}-vars`}>הוספת משתנה (נכנס במקום הסמן)</p>
          <div className="flex flex-wrap gap-2" aria-labelledby={`${id}-vars`}>
            {vars.map((v) => (
              <button key={v} type="button" onClick={() => insert(v)} className="min-h-11 rounded-md border bg-card px-3 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                {VAR_LABELS[v] ?? v}
              </button>
            ))}
          </div>
        </div>
      )}
      {unknown.length > 0 && (
        <p role="status" className="rounded-md bg-warning/20 p-2 text-sm">
          המשתנים האלה לא קיימים במייל הזה ויצאו ריקים: <bdi dir="ltr">{unknown.map((v) => `{{${v}}}`).join(", ")}</bdi>
        </p>
      )}
      <div className="rounded-md border bg-muted/40 p-3 text-sm" aria-label="תצוגה מקדימה">
        <p className="mb-1 text-xs text-muted-foreground">תצוגה מקדימה עם ערכים לדוגמה</p>
        <p className="font-semibold">{renderTemplate(subject, SAMPLE_VARS)}</p>
        <p className="mt-2 whitespace-pre-line">{renderTemplate(body, SAMPLE_VARS)}</p>
      </div>
    </div>
  );
}
