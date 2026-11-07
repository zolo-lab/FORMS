"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { describeExpiryRule, normalizeExpiryRule, type ExpiryRule } from "@/lib/requests/expiry";
import { STEP_WHO, STEP_WHO_LABELS, type StepDraft, type StepWho } from "@/lib/workflow/step-who";
import { defaultEmailField, draftProblems, stepLabel } from "@/lib/workflow/step-fields";
import type { StepRole } from "@/lib/workflow/types";
import { ExpiryRuleBuilder } from "./ExpiryRuleBuilder";

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

const COLS = "md:grid-cols-[2rem_2.25rem_minmax(9rem,1fr)_minmax(10rem,1.3fr)_minmax(11rem,1.2fr)_auto]";

/**
 * "שלבי הטופס" as a table: one row per step, in order. Rows are dragged by their handle (or moved with the arrows);
 * step 1, the sender, stays first. Each row: who the step goes to, the one detail that needs, and the link expiry
 * (opens the rule builder). On a phone each row is a card.
 * `orgView`: an organization that follows this route – everything is read-only except the expiry column, which edits
 * that organization's own expiry for the step (stored on the route as `expiryByOrg`).
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
  dateFields?: Option[];
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
  const [editing, setEditing] = useState<number | null>(null);

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

  return (
    <div className="space-y-3">
      <div role="table" aria-label="שלבי הטופס" className="overflow-hidden rounded-lg border bg-card">
        <div role="row" className={cn("hidden gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground md:grid", COLS)}>
          <span role="columnheader"><span className="sr-only">גרירה</span></span>
          <span role="columnheader">#</span>
          <span role="columnheader">למי השלב הולך</span>
          <span role="columnheader">פרטים</span>
          <span role="columnheader">תוקף הקישור{orgView ? ` · ${orgView.label}` : ""}</span>
          <span role="columnheader"><span className="sr-only">פעולות</span></span>
        </div>
        {drafts.map((s, i) => {
          const n = i + 1;
          const id = `s${i}`;
          const earlier = new Set(drafts.slice(0, i).map((x) => x.role));
          const missing = problems[i]!;
          const isSender = s.who === "requester";
          const movable = !isSender && !orgView;
          const own = expiryOf(s);
          const count = fieldCounts?.[s.role];
          return (
            <div
              key={s.key}
              role="row"
              aria-label={`שלב ${n}`}
              onDragOver={(e) => { if (dragFrom !== null && i >= pinned) { e.preventDefault(); setDropAt(i); } }}
              onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) moveTo(dragFrom, i); setDragFrom(null); setDropAt(null); }}
              className={cn(
                "grid gap-3 border-b p-3 last:border-b-0 md:items-center",
                COLS,
                missing.length > 0 && "bg-destructive/5",
                dragFrom === i && "opacity-50",
                dropAt === i && dragFrom !== null && dragFrom !== i && (dragFrom < i ? "border-b-2 border-b-primary" : "border-t-2 border-t-primary"),
              )}
            >
              <span role="cell" className="hidden md:flex">
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
              <span role="cell" className="flex items-center gap-2">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", isSender ? "bg-primary text-primary-foreground" : "bg-secondary")} aria-hidden>{n}</span>
                <span className="font-semibold md:sr-only">{isSender ? "השולח" : stepLabel(s, i, ctx)}</span>
              </span>

              <div role="cell" className="space-y-1">
                <Label htmlFor={`${id}-who`} className="text-xs text-muted-foreground md:sr-only">למי השלב הולך</Label>
                {isSender ? (
                  <p className="text-sm font-medium">השולח <span className="font-normal text-muted-foreground">– פותח את הבקשה וממלא את השדות שלו</span></p>
                ) : orgView ? (
                  <p className="text-sm font-medium">{stepLabel(s, i, ctx)}</p>
                ) : (
                  <Select id={`${id}-who`} value={s.who} onChange={(e) => choose(i, e.target.value as StepWho)}>
                    {STEP_WHO.filter((w) => w !== "requester").map((w) => (
                      <option key={w} value={w} disabled={w === "employee" && employeeAt >= 0 && employeeAt !== i}>{STEP_WHO_LABELS[w]}</option>
                    ))}
                  </Select>
                )}
                {!isSender && count !== undefined && s.who !== "employee" && (
                  <p className="text-xs text-muted-foreground">{count === 0 ? "רק אישור: רואה את המסמך ומאשר" : `${count} שדות למילוי`}</p>
                )}
              </div>

              <div role="cell" className="space-y-1">
                {isSender || orgView ? (
                  <p className="text-sm text-muted-foreground">{isSender ? "—" : (HINT[s.who] ?? "")}</p>
                ) : (
                  <>
                    {s.who === "contact" && (
                      <>
                        <Label htmlFor={`${id}-contact`} className="text-xs text-muted-foreground">המשתמש</Label>
                        <Select id={`${id}-contact`} value={s.contactId ?? ""} onChange={(e) => patch(i, { contactId: e.target.value || undefined })}>
                          <option value="">בחרו…</option>
                          {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </Select>
                      </>
                    )}
                    {(s.who === "group_all" || s.who === "group_any") && (
                      <>
                        <Label htmlFor={`${id}-group`} className="text-xs text-muted-foreground">הקבוצה</Label>
                        <Select id={`${id}-group`} value={s.groupId ?? ""} onChange={(e) => patch(i, { groupId: e.target.value || undefined })}>
                          <option value="">בחרו…</option>
                          {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                        </Select>
                        <p className="text-xs text-muted-foreground">{HINT[s.who]}</p>
                      </>
                    )}
                    {s.who === "email" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor={`${id}-email`} className="text-xs text-muted-foreground">מייל</Label>
                          <Input id={`${id}-email`} type="email" dir="ltr" value={s.email ?? ""} onChange={(e) => patch(i, { email: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${id}-name`} className="text-xs text-muted-foreground">שם (לא חובה)</Label>
                          <Input id={`${id}-name`} value={s.name ?? ""} onChange={(e) => patch(i, { name: e.target.value })} />
                        </div>
                      </div>
                    )}
                    {s.who === "from_field" && (
                      <>
                        <Label htmlFor={`${id}-field`} className="text-xs text-muted-foreground">שדה המייל</Label>
                        <Select id={`${id}-field`} value={s.fieldId ?? ""} onChange={(e) => patch(i, { fieldId: e.target.value || undefined })}>
                          <option value="">בחרו…</option>
                          {s.fieldId && !emailFields.some((f) => f.id === s.fieldId) && <option value={s.fieldId}>שדה שכבר לא קיים</option>}
                          {emailFields.map((f) => {
                            const at = drafts.findIndex((d) => d.role === f.role);
                            return <option key={f.id} value={f.id} disabled={!earlier.has(f.role)}>{f.label} · {at >= 0 ? `שלב ${at + 1}` : "לא משויך לשלב"}</option>;
                          })}
                        </Select>
                      </>
                    )}
                    {s.who === "employee" && <p className="text-sm text-muted-foreground">{HINT.employee}</p>}
                    <label className="flex min-h-9 items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox checked={!!s.formOnly} onChange={(e) => patch(i, { formOnly: e.target.checked })} />
                      ממלא רק בטופס (בלי מילוי על גבי המסמך)
                    </label>
                  </>
                )}
              </div>

              <div role="cell" className="space-y-1">
                <span className="text-xs text-muted-foreground md:sr-only">תוקף הקישור</span>
                {isSender ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(i)}
                    className={cn("flex min-h-10 w-full items-center rounded-md border px-3 py-1.5 text-start text-sm hover:bg-accent", own ? "border-primary/40 bg-primary/5" : "text-muted-foreground")}
                    aria-label={`תוקף הקישור של שלב ${n}: ${own ? describeExpiryRule(own, fieldLabel) : inheritText(s)}. לחצו לעריכה`}
                  >
                    {own ? describeExpiryRule(own, fieldLabel) : orgView ? "כמו במסלול הכללי" : "כמו בהגדרות השליחה"}
                  </button>
                )}
              </div>

              <div role="cell" className="flex items-center justify-end gap-1">
                {movable && (
                  <>
                    <Button type="button" variant="ghost" size="icon" disabled={i <= pinned} onClick={() => moveTo(i, i - 1)} aria-label={`העלאת שלב ${n}`}><ArrowUp className="size-4" aria-hidden /></Button>
                    <Button type="button" variant="ghost" size="icon" disabled={i === drafts.length - 1} onClick={() => moveTo(i, i + 1)} aria-label={`הורדת שלב ${n}`}><ArrowDown className="size-4" aria-hidden /></Button>
                  </>
                )}
                {!orgView && (
                  <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={drafts.length === 1} onClick={() => onChange(drafts.filter((_, j) => j !== i))} aria-label={isSender ? "מחיקת שלב השולח" : `מחיקת שלב ${n}`}><Trash2 className="size-4" aria-hidden /></Button>
                )}
              </div>

              {missing.length > 0 && (
                <ul role="cell" className="space-y-0.5 text-sm text-destructive md:col-span-full">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
              )}
              {!orgView && i === firstPeopleStep && missing.length === 0 && (
                <p role="cell" className="text-xs text-muted-foreground md:col-span-full">משתמשים וקבוצות מגדירים ב<Link href="/admin/users" className="underline">משתמשים</Link>.</p>
              )}
            </div>
          );
        })}
      </div>

      {!orgView && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onChange([...drafts, { key: crypto.randomUUID(), who: "contact", role: "approver" }])}><Plus className="size-4" aria-hidden />הוספת שלב</Button>
          {drafts[0]?.who !== "requester" && (
            <Button type="button" variant="ghost" onClick={() => onChange([{ key: crypto.randomUUID(), who: "requester", role: "requester" }, ...drafts])}><Plus className="size-4" aria-hidden />החזרת שלב השולח בהתחלה</Button>
          )}
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing !== null ? `תוקף הקישור – שלב ${editing + 1}${orgView ? ` · ${orgView.label}` : ""}` : ""} className="w-[min(94vw,44rem)]">
        {editing !== null && drafts[editing] && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">אחרי התאריך הקישור של השלב לא נפתח, והבקשה מסומנת &quot;פג תוקף&quot; (אפשר להאריך). הקישור נשאר פתוח לפחות 3 ימים מתחילת השלב.</p>
            <ExpiryRuleBuilder
              id={`exp-${editing}`}
              value={expiryOf(drafts[editing]!)}
              onChange={(r) => setExpiry(editing, r)}
              dateFields={dateFields}
              bases={["stepStart", "sent", "field"]}
              inherit={inheritText(drafts[editing]!)}
            />
            <div className="flex justify-end"><Button type="button" onClick={() => setEditing(null)}>סיום</Button></div>
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
