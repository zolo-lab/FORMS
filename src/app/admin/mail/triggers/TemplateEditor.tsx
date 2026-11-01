"use client";
import { useRef, useState } from "react";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renderTemplate } from "@/lib/notifications/templates";
import { renderHtml } from "@/lib/notifications/email-design";
import { SAMPLE_VARS, VAR_LABELS } from "@/lib/notifications/triggers";

/**
 * Subject + the e-mail's HTML with its variables: clicking a variable puts it where the cursor is, and the preview shows
 * the e-mail as it will look, with example values, while it is edited. The surrounding <form> saves it.
 */
export function TemplateEditor({ id, subject: initialSubject, html: initialHtml, vars }: { id: string; subject: string; html: string; vars: string[] }) {
  const [subject, setSubject] = useState(initialSubject);
  const [html, setHtml] = useState(initialHtml);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [lastFocus, setLastFocus] = useState<"subject" | "html">("html");

  function insert(v: string) {
    const token = `{{${v}}}`;
    const el = lastFocus === "subject" ? subjectRef.current : htmlRef.current;
    const value = lastFocus === "subject" ? subject : html;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    if (lastFocus === "subject") setSubject(next);
    else setHtml(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const unknown = [...`${subject}\n${html}`.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!).filter((v, i, a) => !vars.includes(v) && a.indexOf(v) === i);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${id}-subject`}>נושא</Label>
        <Input ref={subjectRef} id={`${id}-subject`} name="subject" value={subject} maxLength={200} required onChange={(e) => setSubject(e.target.value)} onFocus={() => setLastFocus("subject")} />
      </div>
      {vars.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium" id={`${id}-vars`}>הוספת משתנה (נכנס במקום הסמן)</p>
          <div className="flex flex-wrap gap-1.5" aria-labelledby={`${id}-vars`}>
            {vars.map((v) => (
              <button key={v} type="button" onClick={() => insert(v)} className="min-h-9 rounded-md border bg-card px-2.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                {VAR_LABELS[v] ?? v}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-body`}>עיצוב המייל (HTML)</Label>
          <Textarea
            ref={htmlRef}
            id={`${id}-body`}
            name="body"
            value={html}
            rows={18}
            maxLength={30000}
            required
            dir="ltr"
            spellCheck={false}
            className="font-mono text-xs leading-relaxed"
            onChange={(e) => setHtml(e.target.value)}
            onFocus={() => setLastFocus("html")}
          />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">תצוגה מקדימה (ערכים לדוגמה)</p>
          <p className="truncate rounded-t-md border border-b-0 bg-muted/40 px-3 py-2 text-sm"><span className="text-muted-foreground">נושא: </span>{renderTemplate(subject, SAMPLE_VARS)}</p>
          {/* sandbox="" : the preview never runs scripts from the edited HTML. */}
          <iframe title="תצוגה מקדימה" sandbox="" srcDoc={renderHtml(html, SAMPLE_VARS)} className="h-96 w-full rounded-b-md border bg-card" />
        </div>
      </div>
      {unknown.length > 0 && (
        <p role="status" className="rounded-md bg-warning/20 p-2 text-sm">
          המשתנים האלה לא קיימים במייל הזה ויצאו ריקים: <bdi dir="ltr">{unknown.map((v) => `{{${v}}}`).join(", ")}</bdi>
        </p>
      )}
    </div>
  );
}
