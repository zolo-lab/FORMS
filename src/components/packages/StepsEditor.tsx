"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Check, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { STEP_WHO, STEP_WHO_LABELS, type StepDraft, type StepWho } from "@/lib/workflow/step-who";
import { defaultEmailField, draftProblems, stepLabel } from "@/lib/workflow/step-fields";
import type { StepRole } from "@/lib/workflow/types";

type Option = { id: string; label: string };
/** An email field (or group list) of the form, with the step role that fills it. */
export type EmailField = Option & { role: StepRole };
/** A step being edited: `key` stays the same while it is moved; `origRole` is its role when last saved. */
export type EditorDraft = StepDraft & { key: string; origRole?: StepRole };

export type StepsSaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; errors: string[] };

const HINT: Partial<Record<StepWho, string>> = {
  employee: "את השם, המייל או הנייד שלו ממלא השולח כששולחים את הטופס.",
  email: "יקבל קישור ותזכורות במייל, ונכנס עם קוד חד-פעמי שנשלח אליו.",
  from_field: "השלב נשלח למייל שמולא בשדה, ברגע שהשלב מתחיל.",
};

/**
 * "שלבי הטופס": the steps in order. Step 1 is always the sender. Each other step has one "who" choice and only the
 * detail it needs; what is missing shows on the step itself. One save button for all of them.
 */
export function StepsEditor({
  drafts, onChange, contacts, groups, emailFields, dirty, state, onSave, waitingForForm,
}: {
  drafts: EditorDraft[];
  onChange: (next: EditorDraft[]) => void;
  contacts: Option[];
  groups: Option[];
  emailFields: EmailField[];
  dirty: boolean;
  state: StepsSaveState;
  onSave: () => void;
  /** The form itself still has unsaved changes (its fields are checked by the server). */
  waitingForForm: boolean;
}) {
  const ctx = { contacts, groups, fields: emailFields };
  const problems = draftProblems(drafts, emailFields);
  const patch = (i: number, p: Partial<EditorDraft>) => onChange(drafts.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const choose = (i: number, who: StepWho) => {
    const fieldId = who === "from_field" && !drafts[i]!.fieldId ? defaultEmailField(drafts, i, emailFields) : drafts[i]!.fieldId;
    patch(i, { who, fieldId });
  };
  const move = (i: number, by: -1 | 1) => {
    const next = [...drafts];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    onChange(next);
  };
  const employeeAt = drafts.findIndex((d) => d.who === "employee");
  const total = problems.reduce((n, p) => n + p.length, 0);

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {drafts.map((s, i) => {
          const n = i + 1;
          const id = `s${i}`;
          const earlier = new Set(drafts.slice(0, i).map((x) => x.role));
          const missing = problems[i]!;
          if (i === 0) {
            return (
              <li key={s.key} aria-label={`שלב ${n}`} className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>1</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">שלב 1 · השולח</p>
                    <p className="text-sm text-muted-foreground">ממלא את הטופס במערכת ושולח אותו. השלב הזה קבוע.</p>
                  </div>
                  <Lock className="size-4 text-muted-foreground" aria-label="שלב קבוע" />
                </div>
              </li>
            );
          }
          return (
            <li key={s.key} aria-label={`שלב ${n}`} className={cn("rounded-lg border bg-card p-4", missing.length > 0 && "border-destructive/60")}>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold" aria-hidden>{n}</span>
                <p className="min-w-0 flex-1 truncate font-semibold">{stepLabel(s, i, ctx)}</p>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="ghost" size="icon" disabled={i === 1} onClick={() => move(i, -1)} aria-label={`העלאת שלב ${n}`}><ArrowUp className="size-4" aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="icon" disabled={i === drafts.length - 1} onClick={() => move(i, 1)} aria-label={`הורדת שלב ${n}`}><ArrowDown className="size-4" aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => onChange(drafts.filter((_, j) => j !== i))} aria-label={`מחיקת שלב ${n}`}><Trash2 className="size-4" aria-hidden /></Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`${id}-who`}>למי השלב הולך</Label>
                  <Select id={`${id}-who`} value={s.who} onChange={(e) => choose(i, e.target.value as StepWho)}>
                    {STEP_WHO.filter((w) => w !== "requester").map((w) => (
                      <option key={w} value={w} disabled={w === "employee" && employeeAt >= 0 && employeeAt !== i}>{STEP_WHO_LABELS[w]}</option>
                    ))}
                  </Select>
                </div>
                {s.who === "contact" && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-contact`}>המשתמש</Label>
                    <Select id={`${id}-contact`} value={s.contactId ?? ""} onChange={(e) => patch(i, { contactId: e.target.value || undefined })}>
                      <option value="">בחרו…</option>
                      {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </Select>
                  </div>
                )}
                {s.who === "group_all" && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-group`}>הקבוצה</Label>
                    <Select id={`${id}-group`} value={s.groupId ?? ""} onChange={(e) => patch(i, { groupId: e.target.value || undefined })}>
                      <option value="">בחרו…</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                    </Select>
                  </div>
                )}
                {s.who === "email" && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor={`${id}-email`}>מייל</Label>
                      <Input id={`${id}-email`} type="email" dir="ltr" value={s.email ?? ""} onChange={(e) => patch(i, { email: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${id}-name`}>שם (לא חובה)</Label>
                      <Input id={`${id}-name`} value={s.name ?? ""} onChange={(e) => patch(i, { name: e.target.value })} />
                    </div>
                  </>
                )}
                {s.who === "from_field" && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-field`}>שדה המייל</Label>
                    <Select id={`${id}-field`} value={s.fieldId ?? ""} onChange={(e) => patch(i, { fieldId: e.target.value || undefined })}>
                      <option value="">בחרו…</option>
                      {s.fieldId && !emailFields.some((f) => f.id === s.fieldId) && <option value={s.fieldId}>שדה שכבר לא קיים</option>}
                      {emailFields.map((f) => {
                        const at = drafts.findIndex((d) => d.role === f.role);
                        return <option key={f.id} value={f.id} disabled={!earlier.has(f.role)}>{f.label} · {at >= 0 ? `שלב ${at + 1}` : "לא משויך לשלב"}</option>;
                      })}
                    </Select>
                  </div>
                )}
                <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2">
                  <Checkbox checked={!!s.formOnly} onChange={(e) => patch(i, { formOnly: e.target.checked })} />
                  ממלא רק בטופס, בלי האפשרות למלא על גבי המסמך
                </label>
              </div>
              {missing.length > 0 ? (
                <ul className="mt-2 space-y-0.5 text-sm text-destructive">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
              ) : HINT[s.who] ? (
                <p className="mt-2 text-xs text-muted-foreground">{HINT[s.who]}</p>
              ) : null}
              {(s.who === "contact" || s.who === "group_all") && <p className="mt-1 text-xs text-muted-foreground">משתמשים וקבוצות מגדירים ב<Link href="/admin/users" className="underline">משתמשים</Link>.</p>}
            </li>
          );
        })}
      </ol>
      <Button type="button" variant="outline" onClick={() => onChange([...drafts, { key: crypto.randomUUID(), who: "contact", role: "approver" }])}><Plus className="size-4" aria-hidden />הוספת שלב</Button>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <Button type="button" onClick={onSave} disabled={state.kind === "saving" || !dirty || total > 0 || waitingForForm}>
          {state.kind === "saving" ? "שומר…" : "שמירת השלבים"}
        </Button>
        <span aria-live="polite" className="text-sm">
          {state.kind === "saved" && !dirty ? (
            <span role="status" className="inline-flex items-center gap-1 text-success"><Check className="size-4" aria-hidden />השלבים נשמרו</span>
          ) : total > 0 ? (
            <span className="text-destructive">יש {total === 1 ? "דבר אחד" : `${total} דברים`} להשלים בשלבים</span>
          ) : waitingForForm ? (
            <span className="text-muted-foreground">שומר את הטופס…</span>
          ) : dirty ? (
            <span className="text-muted-foreground">יש שינויים שלא נשמרו</span>
          ) : null}
        </span>
        {state.kind === "error" && (
          <ul role="alert" className="basis-full list-inside list-disc text-sm text-destructive">
            {state.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
