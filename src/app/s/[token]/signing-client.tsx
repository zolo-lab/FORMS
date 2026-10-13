"use client";
import { useEffect, useRef, useState } from "react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { Card } from "@/components/ui/card";
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
}

export function SigningClient({ token, definition, initialAnswers, filled, role, subjectName }: Props) {
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

  if (done) {
    return (
      <Card className="space-y-2 p-6 text-center" role="status">
        <h1 className="text-xl font-bold">תודה, הפרטים נשלחו</h1>
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
      <FormRenderer definition={definition} answers={answers} onChange={setAnswers} errors={errors} role={role} onSubmit={onSubmit} />
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {saveState === "saving" && "שומר…"}
        {saveState === "saved" && "נשמר אוטומטית"}
        {saveState === "error" && "השמירה האוטומטית נכשלה"}
      </p>
    </div>
  );
}
