"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STEP_WHO, STEP_WHO_LABELS, assignRoles, type StepDraft, type StepWho } from "@/lib/workflow/step-who";
import type { SaveStepsResult } from "@/app/admin/packages/actions";

type Option = { id: string; label: string };

const HINTS: Partial<Record<StepWho, string>> = {
  requester: "ממלא את הטופס במערכת ושולח אותו.",
  employee: "את השם, המייל או הנייד שלו ממלאים כששולחים את הטופס (במסך \"פרטי העובד\").",
  email: "יקבל קישור ותזכורות במייל, ונכנס עם קוד חד-פעמי שנשלח למייל שלו.",
  from_field: "השלב נשלח למייל שמולא בשדה הזה בטופס (או למי שנבחר ברשימה של קבוצה).",
};

/**
 * "שלבי הטופס": all steps edited together and saved with one button, which says when it worked. Each step has one
 * "who" choice and only the detail that choice needs.
 */
export function StepsEditor({
  packageId, initial, contacts, groups, emailFields, save,
}: {
  packageId: string; initial: StepDraft[]; contacts: Option[]; groups: Option[]; emailFields: Option[];
  save: (packageId: string, drafts: StepDraft[]) => Promise<SaveStepsResult>;
}) {
  const [steps, setSteps] = useState<StepDraft[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<SaveStepsResult | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Each step that goes to a chosen person gets its own role behind the scenes (it ties the fields to the step).
  const change = (next: StepDraft[]) => { setSteps(assignRoles(next)); setDirty(true); setResult(null); };
  const patch = (i: number, p: Partial<StepDraft>) => change(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...steps];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    change(next);
  };
  const onSave = () => start(async () => {
    const r = await save(packageId, steps);
    setResult(r);
    if (r.ok) setDirty(false);
  });

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {steps.map((s, i) => {
          const n = i + 1;
          const id = `s${i}`;
          const fields = s.fieldId && !emailFields.some((f) => f.id === s.fieldId) ? [...emailFields, { id: s.fieldId, label: `${s.fieldId} (לא שדה מייל)` }] : emailFields;
          return (
            <li key={i} className="rounded-lg border bg-card p-3" aria-label={`שלב ${n}`}>
              <div className="flex flex-wrap items-end gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center self-center rounded-full bg-secondary text-sm font-semibold" aria-hidden>{n}</span>
                <div className="min-w-56 flex-1 space-y-1">
                  <Label htmlFor={`${id}-who`}>מי בשלב {n}</Label>
                  <Select id={`${id}-who`} value={s.who} onChange={(e) => patch(i, { who: e.target.value as StepWho })}>
                    {STEP_WHO.map((w) => <option key={w} value={w}>{STEP_WHO_LABELS[w]}</option>)}
                  </Select>
                </div>
                {s.who === "contact" && (
                  <div className="min-w-48 flex-1 space-y-1">
                    <Label htmlFor={`${id}-contact`}>המשתמש</Label>
                    <Select id={`${id}-contact`} value={s.contactId ?? ""} onChange={(e) => patch(i, { contactId: e.target.value || undefined })}>
                      <option value="">בחרו…</option>
                      {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </Select>
                  </div>
                )}
                {s.who === "group_all" && (
                  <div className="min-w-48 flex-1 space-y-1">
                    <Label htmlFor={`${id}-group`}>הקבוצה</Label>
                    <Select id={`${id}-group`} value={s.groupId ?? ""} onChange={(e) => patch(i, { groupId: e.target.value || undefined })}>
                      <option value="">בחרו…</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                    </Select>
                  </div>
                )}
                {s.who === "email" && (
                  <>
                    <div className="min-w-48 flex-1 space-y-1">
                      <Label htmlFor={`${id}-email`}>מייל</Label>
                      <Input id={`${id}-email`} type="email" dir="ltr" value={s.email ?? ""} onChange={(e) => patch(i, { email: e.target.value })} />
                    </div>
                    <div className="min-w-40 flex-1 space-y-1">
                      <Label htmlFor={`${id}-name`}>שם (לא חובה)</Label>
                      <Input id={`${id}-name`} value={s.name ?? ""} onChange={(e) => patch(i, { name: e.target.value })} />
                    </div>
                  </>
                )}
                {s.who === "from_field" && (
                  <div className="min-w-48 flex-1 space-y-1">
                    <Label htmlFor={`${id}-field`}>שדה המייל</Label>
                    <Select id={`${id}-field`} value={s.fieldId ?? ""} onChange={(e) => patch(i, { fieldId: e.target.value || undefined })}>
                      <option value="">{fields.length ? "בחרו…" : "אין בטופס שדה מייל"}</option>
                      {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </Select>
                  </div>
                )}
                {s.who !== "requester" && (
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <Checkbox checked={!!s.formOnly} onChange={(e) => patch(i, { formOnly: e.target.checked })} />
                    רק טופס רספונסיבי
                  </label>
                )}
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`העלאת שלב ${n}`}><ArrowUp className="size-4" aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="icon" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={`הורדת שלב ${n}`}><ArrowDown className="size-4" aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => change(steps.filter((_, j) => j !== i))} aria-label={`מחיקת שלב ${n}`}><Trash2 className="size-4" aria-hidden /></Button>
                </div>
              </div>
              {HINTS[s.who] && <p className="mt-2 text-xs text-muted-foreground">{HINTS[s.who]}</p>}
              {(s.who === "contact" || s.who === "group_all") && <p className="mt-2 text-xs text-muted-foreground">משתמשים וקבוצות מגדירים ב<Link href="/admin/users" className="underline">משתמשים</Link>.</p>}
              {s.who === "from_field" && emailFields.length === 0 && <p className="mt-2 text-xs text-warning">הוסיפו לטופס שדה מסוג &quot;דוא&quot;ל&quot; כדי לבחור כך.</p>}
            </li>
          );
        })}
      </ol>
      <Button type="button" variant="outline" onClick={() => change([...steps, { who: "contact", role: "requester" }])}><Plus className="size-4" aria-hidden />הוספת שלב</Button>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <Button type="button" onClick={onSave} disabled={pending || !dirty}>{pending ? "שומר…" : "שמירת השלבים"}</Button>
        <span aria-live="polite" className="text-sm">
          {pending ? null : result?.ok ? (
            <span role="status" className="inline-flex items-center gap-1 text-success"><Check className="size-4" aria-hidden />השלבים נשמרו</span>
          ) : dirty ? (
            <span className="text-muted-foreground">יש שינויים שלא נשמרו</span>
          ) : null}
        </span>
        {result && !result.ok && (
          <ul role="alert" className="basis-full list-inside list-disc text-sm text-destructive">
            {result.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
