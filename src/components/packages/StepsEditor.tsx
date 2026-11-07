"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { describeExpiryRule, normalizeExpiryRule, type ExpiryRule } from "@/lib/requests/expiry";
import { STEP_WHO, STEP_WHO_LABELS, type StepDraft, type StepWho } from "@/lib/workflow/step-who";
import { defaultEmailField, draftProblems, stepLabel, stepTarget } from "@/lib/workflow/step-fields";
import type { StepRole } from "@/lib/workflow/types";
import { ExpiryRuleBuilder, type DateFieldOption } from "./ExpiryRuleBuilder";

type Option = { id: string; label: string };
/** An email field (or group list) of the form, with the step role that fills it. */
export type EmailField = Option & { role: StepRole };
/** A step being edited: `key` stays the same while it is moved; `origRole` is its role when last saved. */
export type EditorDraft = StepDraft & { key: string; origRole?: StepRole };

export type StepsSaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; errors: string[] };

const HINT: Partial<Record<StepWho, string>> = {
  employee: "האדם שהטופס עליו: את השם והמייל או הנייד שלו מזינים בשליחה.",
  email: "נכנס עם קוד חד-פעמי שנשלח למייל.",
  from_field: "נשלח למייל שמולא בשדה, כשהשלב מתחיל.",
  group_any: "כולם מקבלים קישור; הראשון שחותם סוגר את השלב.",
  group_all: "כולם מקבלים קישור; השלב נגמר כשכולם חתמו.",
};

/** A rule that is not complete yet (a date rule with no field chosen) – shown on the step until fixed. */
function expiryProblem(rule: ExpiryRule | undefined): string | null {
  if (!rule) return null;
  return normalizeExpiryRule(rule) ? null : "תוקף הקישור: הכלל לא שלם (למשל לא נבחר שדה תאריך)";
}

const COLS = "grid-cols-[2rem_2.25rem_minmax(10rem,1.3fr)_minmax(8rem,0.8fr)_minmax(12rem,1.3fr)_auto]";
const SHORT_WHO: Record<StepWho, string> = {
  requester: "פותח את הבקשה",
  employee: "העובד שהטופס עליו",
  contact: "משתמש מוגדר",
  group_any: "קבוצה – אחד חותם",
  group_all: "קבוצה – כולם חותמים",
  email: "מייל קבוע",
  from_field: "מייל משדה בטופס",
};

/**
 * "שלבי הטופס" as a list of records: one row per step, in order – who fills it, what they fill and when its link
 * expires. Rows are dragged by their handle (or moved with the arrows); step 1, the sender, stays first. A row opens
 * a dialog with all of the step's settings. On a narrow screen the table scrolls sideways.
 * `orgView`: an organization that follows this route – the dialog edits only that organization's own expiry for the
 * step (stored on the route as `expiryByOrg`).
 */
export function StepsEditor({
  drafts, onChange, contacts, groups, emailFields, dirty, state, onSave, waitingForForm, fieldCounts, dateFields = [], defaultExpiry, orgView,
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
  /** How many fields each step edits (by role): a step with none only looks the document over and approves it. */
  fieldCounts?: Partial<Record<string, number>>;
  /** Date fields of the form, for expiry rules counted from a date. */
  dateFields?: DateFieldOption[];
  /** The form's default expiry, in words ("30 ימים מהשליחה"). */
  defaultExpiry?: string;
  orgView?: Option;
}) {
  const ctx = { contacts, groups, fields: emailFields };
  const fieldLabel = (fid: string) => dateFields.find((f) => f.id === fid)?.label ?? fid;
  const formDefault = defaultExpiry ?? "30 ימים מהשליחה";
  const expiryOf = (d: EditorDraft) => (orgView ? d.expiryByOrg?.[orgView.id] : d.expiry);
  const problems = draftProblems(drafts, emailFields).map((p, i) => {
    const more = expiryProblem(expiryOf(drafts[i]!));
    return more ? [...p, more] : p;
  });
  const patch = (i: number, p: Partial<EditorDraft>) => onChange(drafts.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const choose = (i: number, who: StepWho) => {
    const fieldId = who === "from_field" && !drafts[i]!.fieldId ? defaultEmailField(drafts, i, emailFields) : drafts[i]!.fieldId;
    patch(i, { who, fieldId });
  };
  const pinned = drafts[0]?.who === "requester" ? 1 : 0;
  const moveTo = (from: number, to: number) => {
    if (from === to || to < pinned || from < pinned) return;
    const next = [...drafts];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row!);
    onChange(next);
  };
  const employeeAt = drafts.findIndex((d) => d.who === "employee");
  const total = problems.reduce((n, p) => n + p.length, 0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  // The step open in the dialog, by key (it keeps following the step when rows move).
  const [editKey, setEditKey] = useState<string | null>(null);
  const editing = editKey ? drafts.findIndex((d) => d.key === editKey) : -1;

  const inheritText = (d: EditorDraft) =>
    orgView ? `כמו במסלול הכללי (${d.expiry ? describeExpiryRule(d.expiry, fieldLabel) : formDefault})` : `כמו בהגדרות השליחה (${formDefault})`;
  const setExpiry = (i: number, rule: ExpiryRule | undefined) => {
    const d = drafts[i]!;
    if (!orgView) return patch(i, { expiry: rule });
    const byOrg = { ...(d.expiryByOrg ?? {}) };
    if (rule) byOrg[orgView.id] = rule;
    else delete byOrg[orgView.id];
    patch(i, { expiryByOrg: Object.keys(byOrg).length ? byOrg : undefined });
  };
  const firstPeopleStep = drafts.findIndex((d) => d.who === "contact" || d.who === "group_all" || d.who === "group_any");
  const addStep = () => {
    const key = crypto.randomUUID();
    onChange([...drafts, { key, who: "contact", role: "approver" }]);
    setEditKey(key);
  };

  const ed = editing >= 0 ? drafts[editing]! : null;
  const edId = `s${editing}`;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div role="table" aria-label="שלבי הטופס" className="min-w-[46rem]">
          <div role="row" className={cn("grid items-center gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground", COLS)}>
            <span role="columnheader"><span className="sr-only">גרירה</span></span>
            <span role="columnheader">#</span>
            <span role="columnheader">מי ממלא</span>
            <span role="columnheader">מה ממלא</span>
            <span role="columnheader">תוקף הקישור{orgView ? ` · ${orgView.label}` : ""}</span>
            <span role="columnheader"><span className="sr-only">פעולות</span></span>
          </div>
          {drafts.map((s, i) => {
            const n = i + 1;
            const missing = problems[i]!;
            const isSender = s.who === "requester";
            const movable = !isSender && !orgView;
            const own = expiryOf(s);
            const count = fieldCounts?.[s.role];
            const editable = !isSender || !orgView;
            return (
              <div
                key={s.key}
                role="row"
                aria-label={`שלב ${n}`}
                onDragOver={(e) => { if (dragFrom !== null && i >= pinned) { e.preventDefault(); setDropAt(i); } }}
                onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) moveTo(dragFrom, i); setDragFrom(null); setDropAt(null); }}
                className={cn(
                  "grid items-center gap-x-3 gap-y-1 border-b px-3 py-2 last:border-b-0 hover:bg-muted/30",
                  COLS,
                  missing.length > 0 && "bg-destructive/5",
                  dragFrom === i && "opacity-50",
                  dropAt === i && dragFrom !== null && dragFrom !== i && (dragFrom < i ? "border-b-2 border-b-primary" : "border-t-2 border-t-primary"),
                )}
              >
                <span role="cell" className="flex">
                  {movable && (
                    <span
                      draggable
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); setDragFrom(i); }}
                      onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
                      className="flex size-8 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent active:cursor-grabbing"
                      title="גררו כדי לשנות את הסדר"
                      aria-hidden
                    >
                      <GripVertical className="size-4" />
                    </span>
                  )}
                </span>
                <span role="cell" className={cn("flex size-8 items-center justify-center rounded-full text-sm font-semibold", isSender ? "bg-primary text-primary-foreground" : "bg-secondary")}>{n}</span>
                <span role="cell" className="min-w-0">
                  <button type="button" disabled={isSender} onClick={() => setEditKey(s.key)} className="block min-h-10 w-full rounded text-start hover:underline disabled:cursor-default disabled:no-underline">
                    <span className="block truncate text-sm font-medium">{isSender ? "השולח" : stepTarget(s, ctx)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{SHORT_WHO[s.who]}</span>
                  </button>
                </span>
                <span role="cell" className="text-sm">
                  {isSender ? "השדות שלו ושליחה" : s.who === "employee" ? "השדות שלו וחתימה" : count === undefined ? "—" : count === 0 ? "רק אישור" : `${count} שדות`}
                  {s.formOnly && <span className="block text-xs text-muted-foreground">רק בטופס</span>}
                </span>
                <span role="cell" className={cn("min-w-0 text-sm", !own && "text-muted-foreground")}>
                  {isSender ? "—" : own ? describeExpiryRule(own, fieldLabel) : orgView ? "כמו במסלול הכללי" : `ברירת מחדל · ${formDefault}`}
                </span>
                <span role="cell" className="flex items-center justify-end gap-0.5">
                  {movable && (
                    <>
                      <Button type="button" variant="ghost" size="icon" disabled={i <= pinned} onClick={() => moveTo(i, i - 1)} aria-label={`העלאת שלב ${n}`}><ArrowUp className="size-4" aria-hidden /></Button>
                      <Button type="button" variant="ghost" size="icon" disabled={i === drafts.length - 1} onClick={() => moveTo(i, i + 1)} aria-label={`הורדת שלב ${n}`}><ArrowDown className="size-4" aria-hidden /></Button>
                    </>
                  )}
                  {editable && !isSender && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setEditKey(s.key)} aria-label={`עריכת שלב ${n}`}><Pencil className="size-4" aria-hidden /></Button>
                  )}
                  {!orgView && (
                    <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={drafts.length === 1} onClick={() => onChange(drafts.filter((_, j) => j !== i))} aria-label={isSender ? "מחיקת שלב השולח" : `מחיקת שלב ${n}`}><Trash2 className="size-4" aria-hidden /></Button>
                  )}
                </span>
                {missing.length > 0 && (
                  <button role="cell" type="button" onClick={() => setEditKey(s.key)} className="col-span-full flex flex-wrap gap-x-3 ps-[5.25rem] text-start text-sm text-destructive underline-offset-2 hover:underline">
                    {missing.map((m) => <span key={m}>{m}</span>)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!orgView && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={addStep}><Plus className="size-4" aria-hidden />הוספת שלב</Button>
          {drafts[0]?.who !== "requester" && (
            <Button type="button" variant="ghost" onClick={() => onChange([{ key: crypto.randomUUID(), who: "requester", role: "requester" }, ...drafts])}><Plus className="size-4" aria-hidden />החזרת שלב השולח בהתחלה</Button>
          )}
        </div>
      )}

      <Dialog open={!!ed} onClose={() => setEditKey(null)} title={ed ? `${stepLabel(ed, editing, ctx)}${orgView ? ` · ${orgView.label}` : ""}` : ""} className="w-[min(94vw,44rem)]">
        {ed && (
          <div className="space-y-5">
            {!orgView && (
              <fieldset className="space-y-3">
                <legend className="mb-1 text-sm font-semibold">מי ממלא</legend>
                <div className="space-y-1">
                  <Label htmlFor={`${edId}-who`}>למי השלב הולך</Label>
                  <Select id={`${edId}-who`} value={ed.who} onChange={(e) => choose(editing, e.target.value as StepWho)}>
                    {STEP_WHO.filter((w) => w !== "requester").map((w) => (
                      <option key={w} value={w} disabled={w === "employee" && employeeAt >= 0 && employeeAt !== editing}>{STEP_WHO_LABELS[w]}</option>
                    ))}
                  </Select>
                  {HINT[ed.who] && <p className="text-xs text-muted-foreground">{HINT[ed.who]}</p>}
                </div>
                {ed.who === "contact" && (
                  <div className="space-y-1">
                    <Label htmlFor={`${edId}-contact`}>המשתמש</Label>
                    <Select id={`${edId}-contact`} value={ed.contactId ?? ""} onChange={(e) => patch(editing, { contactId: e.target.value || undefined })}>
                      <option value="">בחרו…</option>
                      {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </Select>
                  </div>
                )}
                {(ed.who === "group_all" || ed.who === "group_any") && (
                  <div className="space-y-1">
                    <Label htmlFor={`${edId}-group`}>הקבוצה</Label>
                    <Select id={`${edId}-group`} value={ed.groupId ?? ""} onChange={(e) => patch(editing, { groupId: e.target.value || undefined })}>
                      <option value="">בחרו…</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                    </Select>
                  </div>
                )}
                {ed.who === "email" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`${edId}-email`}>מייל</Label>
                      <Input id={`${edId}-email`} type="email" dir="ltr" value={ed.email ?? ""} onChange={(e) => patch(editing, { email: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${edId}-name`}>שם (לא חובה)</Label>
                      <Input id={`${edId}-name`} value={ed.name ?? ""} onChange={(e) => patch(editing, { name: e.target.value })} />
                    </div>
                  </div>
                )}
                {ed.who === "from_field" && (
                  <div className="space-y-1">
                    <Label htmlFor={`${edId}-field`}>שדה המייל</Label>
                    <Select id={`${edId}-field`} value={ed.fieldId ?? ""} onChange={(e) => patch(editing, { fieldId: e.target.value || undefined })}>
                      <option value="">בחרו…</option>
                      {ed.fieldId && !emailFields.some((f) => f.id === ed.fieldId) && <option value={ed.fieldId}>שדה שכבר לא קיים</option>}
                      {emailFields.map((f) => {
                        const at = drafts.findIndex((d) => d.role === f.role);
                        return <option key={f.id} value={f.id} disabled={at < 0 || at >= editing}>{f.label} · {at >= 0 ? `שלב ${at + 1}` : "לא משויך לשלב"}</option>;
                      })}
                    </Select>
                  </div>
                )}
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <Checkbox checked={!!ed.formOnly} onChange={(e) => patch(editing, { formOnly: e.target.checked })} />
                  ממלא רק בטופס (בלי מילוי על גבי המסמך)
                </label>
                {editing === firstPeopleStep && <p className="text-xs text-muted-foreground">משתמשים וקבוצות מגדירים ב<Link href="/admin/users" className="underline">משתמשים</Link>.</p>}
              </fieldset>
            )}
            <div className={cn(!orgView && "border-t pt-4")}>
              <ExpiryRuleBuilder
                id={`exp-${editing}`}
                value={expiryOf(ed)}
                onChange={(r) => setExpiry(editing, r)}
                dateFields={dateFields}
                bases={["stepStart", "sent"]}
                inherit={inheritText(ed)}
              />
              <p className="mt-3 text-xs text-muted-foreground">אחרי התאריך הקישור של השלב לא נפתח והבקשה מסומנת &quot;פג תוקף&quot; (אפשר להאריך). הקישור פתוח לפחות 3 ימים מתחילת השלב.</p>
            </div>
            {problems[editing]!.length > 0 && (
              <ul className="space-y-0.5 text-sm text-destructive">{problems[editing]!.map((m) => <li key={m}>{m}</li>)}</ul>
            )}
            <div className="flex justify-end"><Button type="button" onClick={() => setEditKey(null)}>סיום</Button></div>
          </div>
        )}
      </Dialog>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <Button type="button" onClick={onSave} disabled={state.kind === "saving" || !dirty || total > 0 || waitingForForm}>
          {state.kind === "saving" && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
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
