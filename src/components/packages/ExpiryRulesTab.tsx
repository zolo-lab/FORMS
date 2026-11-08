"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ViewToggle, type ViewMode } from "@/components/ui/view-toggle";
import { describeExpiryRule, expiryRuleFields, normalizeExpiryRule, type ExpiryRule, type ExpiryRuleRow } from "@/lib/requests/expiry";
import { ExpiryRuleBuilder, type DateFieldOption } from "./ExpiryRuleBuilder";
import type { StepsSaveState } from "./StepsEditor";

type Option = { id: string; label: string };
export type ExpiryRules = { formRule: ExpiryRule | null; rows: ExpiryRuleRow[] };
/** A row being edited in the dialog; `index` -1 = a new row, "form" = the form's own rule. */
type Editing = { index: number | "form"; stepRole: string; orgId: string; rule: ExpiryRule | undefined };

const DEFAULT_TEXT = "30 ימים מהשליחה";
/** For every step or an organization the rule is set when the request is sent: "the step's start" becomes "sending". */
function atSending(rule: ExpiryRule | undefined): ExpiryRule | undefined {
  const fix = <R extends ExpiryRule>(r: R): R => (r.kind === "calc" && r.base.from === "stepStart" ? { ...r, base: { from: "sent" } } : r);
  if (!rule) return rule;
  if (rule.kind === "cases") return { ...rule, cases: rule.cases.map((c) => ({ ...c, then: fix(c.then) })), otherwise: fix(rule.otherwise) };
  return fix(rule);
}
const COLS = "grid-cols-[minmax(8rem,1fr)_minmax(7rem,0.8fr)_minmax(14rem,2fr)_auto]";

/**
 * "כללי תוקף": when the links of the form close, as a table of rules. The first row is the form's own rule (every
 * step, every organization); the others are for one step and/or one organization. The most specific rule applies:
 * step + organization, then the step, then the organization, then the form's. A rule is built in a dialog.
 * `steps`: the steps of the general route after the sender, in order; `dateFieldsFor(step)`: the date fields a rule
 * there can use (filled before that step starts – before sending, for the form or an organization).
 */
export function ExpiryRulesTab({ value, onChange, steps, orgs, dateFieldsFor, dirty, state, onSave, waitingForForm }: {
  value: ExpiryRules;
  onChange: (next: ExpiryRules) => void;
  steps: Option[];
  orgs: Option[];
  dateFieldsFor: (stepRole: string | null) => DateFieldOption[];
  dirty: boolean;
  state: StepsSaveState;
  onSave: () => void;
  waitingForForm: boolean;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [view, setView] = useState<ViewMode>("table");
  const stepName = (role?: string) => (role ? (steps.find((s) => s.id === role)?.label ?? "שלב שכבר לא קיים") : "כל השלבים");
  const orgName = (id?: string) => (id ? (orgs.find((o) => o.id === id)?.label ?? "עמותה שכבר לא פעילה") : "כל העמותות");
  const fieldLabel = (scope: string | null) => (fid: string) => dateFieldsFor(scope).find((f) => f.id === fid)?.label ?? "שדה שכבר לא קיים";
  // A rule's problems where it is shown: a date field it reads that is gone, or filled only after its step starts.
  const problemOf = (rule: ExpiryRule, scope: string | null): string | null => {
    const fields = dateFieldsFor(scope);
    const ids = expiryRuleFields(rule);
    if (ids.some((id) => !fields.some((f) => f.id === id))) return "שדה תאריך בכלל כבר לא קיים בטופס";
    if (ids.some((id) => fields.find((f) => f.id === id)?.unavailable)) return scope ? "התאריך עוד לא מולא כשהשלב מתחיל" : "התאריך עוד לא מולא כשהבקשה נשלחת";
    return null;
  };
  // Shown in order: by step (as the route goes, "all steps" first), then by organization.
  const order = (r: ExpiryRuleRow) => [r.stepRole ? steps.findIndex((s) => s.id === r.stepRole) + 1 || 999 : 0, r.orgId ? orgName(r.orgId) : ""] as const;
  const sorted = value.rows.map((r, i) => ({ r, i })).sort((a, b) => {
    const [sa, oa] = order(a.r);
    const [sb, ob] = order(b.r);
    return sa - sb || oa.localeCompare(ob, "he");
  });
  const problems = [
    ...(value.formRule ? [problemOf(value.formRule, null)].filter(Boolean) : []),
    ...value.rows.map((r) => problemOf(r.rule, r.stepRole ?? null)).filter(Boolean),
  ];

  // The dialog: the scope it is set for, and whether that scope is taken by another row.
  const scope = editing?.stepRole || null;
  const taken = !!editing && editing.index !== "form"
    && value.rows.some((r, i) => i !== editing.index && (r.stepRole ?? "") === editing.stepRole && (r.orgId ?? "") === editing.orgId);
  const noScope = !!editing && editing.index !== "form" && !editing.stepRole && !editing.orgId;
  const incomplete = !!editing && (editing.index === "form" ? !!editing.rule && !normalizeExpiryRule(editing.rule) : !editing.rule || !normalizeExpiryRule(editing.rule));
  const apply = () => {
    if (!editing || taken || noScope || incomplete) return;
    if (editing.index === "form") onChange({ ...value, formRule: editing.rule ?? null });
    else {
      const row: ExpiryRuleRow = {
        id: editing.index >= 0 ? value.rows[editing.index]!.id : crypto.randomUUID(),
        ...(editing.stepRole ? { stepRole: editing.stepRole } : {}),
        ...(editing.orgId ? { orgId: editing.orgId } : {}),
        rule: editing.rule!,
      };
      onChange({ ...value, rows: editing.index >= 0 ? value.rows.map((r, i) => (i === editing.index ? row : r)) : [...value.rows, row] });
    }
    setEditing(null);
  };

  const rowView = (key: string, step: string, org: string, text: string, problem: string | null, actions: React.ReactNode, first = false) => view === "cards" ? (
    <li key={key} className={cn("flex flex-col gap-2 rounded-lg border bg-card p-3", first && "bg-muted/30", problem && "border-destructive/50 bg-destructive/5")}>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">{step}</span>
        <span className="rounded-full border px-2 py-0.5">{org}</span>
        {first && <span className="text-xs text-muted-foreground">כל הטופס</span>}
      </div>
      <p className="text-sm">{text}</p>
      {problem && <p className="text-xs text-destructive">{problem}</p>}
      <div className="mt-auto flex items-center justify-end gap-0.5 border-t pt-1">{actions}</div>
    </li>
  ) : (
    <div key={key} role="row" className={cn("grid items-center gap-x-3 gap-y-1 border-b px-3 py-2.5 last:border-b-0", COLS, first && "bg-muted/30", problem && "bg-destructive/5")}>
      <span role="cell" className="text-sm font-medium">{step}</span>
      <span role="cell" className="text-sm">{org}</span>
      <span role="cell" className="min-w-0 text-sm">
        {text}
        {problem && <span className="block text-xs text-destructive">{problem}</span>}
      </span>
      <span role="cell" className="flex items-center justify-end gap-0.5">{actions}</span>
    </div>
  );

  const items = (
    <>
      {rowView(
        "form",
        "כל השלבים",
        "כל העמותות",
        value.formRule ? describeExpiryRule(value.formRule, fieldLabel(null)) : `${DEFAULT_TEXT} (ברירת מחדל)`,
        value.formRule ? problemOf(value.formRule, null) : null,
        <Button type="button" variant="ghost" size="icon" onClick={() => setEditing({ index: "form", stepRole: "", orgId: "", rule: value.formRule ?? undefined })} aria-label="עריכת הכלל של כל הטופס"><Pencil className="size-4" aria-hidden /></Button>,
        true,
      )}
      {sorted.map(({ r, i }) => rowView(
        r.id,
        stepName(r.stepRole),
        orgName(r.orgId),
        describeExpiryRule(r.rule, fieldLabel(r.stepRole ?? null)),
        problemOf(r.rule, r.stepRole ?? null),
        <>
          <Button type="button" variant="ghost" size="icon" onClick={() => setEditing({ index: i, stepRole: r.stepRole ?? "", orgId: r.orgId ?? "", rule: r.rule })} aria-label={`עריכת הכלל של ${stepName(r.stepRole)} · ${orgName(r.orgId)}`}><Pencil className="size-4" aria-hidden /></Button>
          <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => onChange({ ...value, rows: value.rows.filter((_, j) => j !== i) })} aria-label={`מחיקת הכלל של ${stepName(r.stepRole)} · ${orgName(r.orgId)}`}><Trash2 className="size-4" aria-hidden /></Button>
        </>,
      ))}
    </>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <section className="space-y-3" aria-labelledby="expiry-h">
        <div className="space-y-1">
          <h2 id="expiry-h" className="text-lg font-semibold">כללי תוקף</h2>
          <p className="text-sm text-muted-foreground">מתי נסגר הקישור שנשלח בכל שלב. כשכמה כללים מתאימים, הכלל המדויק ביותר קובע: שלב ועמותה ← שלב ← עמותה ← כל הטופס.</p>
        </div>

        <div className="flex justify-end"><ViewToggle value={view} onChange={setView} label="תצוגת הכללים" /></div>
        {view === "cards" ? (
          <ul aria-label="כללי תוקף" className="grid gap-3 sm:grid-cols-2">
            {items}
          </ul>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <div role="table" aria-label="כללי תוקף" className="min-w-[40rem]">
            <div role="row" className={cn("grid items-center gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground", COLS)}>
              <span role="columnheader">חל על</span>
              <span role="columnheader">עמותה</span>
              <span role="columnheader">מתי הקישור נסגר</span>
              <span role="columnheader"><span className="sr-only">פעולות</span></span>
            </div>
            {items}
          </div>
        </div>
        )}
        {value.rows.length === 0 && <p className="text-sm text-muted-foreground">אין כללים נוספים: כל הקישורים נסגרים לפי השורה הראשונה.</p>}
        <Button type="button" variant="outline" onClick={() => setEditing({ index: -1, stepRole: steps[0]?.id ?? "", orgId: "", rule: { kind: "calc", base: { from: "stepStart" }, addDays: 7 } })}>
          <Plus className="size-4" aria-hidden />הוספת כלל
        </Button>
      </section>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.index === "form" ? "הכלל של כל הטופס" : editing?.index === -1 ? "כלל חדש" : "עריכת כלל"} className="w-[min(94vw,44rem)]">
        {editing && (
          <div className="space-y-5">
            {editing.index === "form" ? (
              <p className="text-sm text-muted-foreground">חל על כל שלב ועל כל עמותה שאין להם כלל משלהם. נקבע כשהבקשה נשלחת.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="er-step">חל על</Label>
                  <Select id="er-step" value={editing.stepRole} onChange={(e) => setEditing({ ...editing, stepRole: e.target.value, rule: e.target.value ? editing.rule : atSending(editing.rule) })}>
                    <option value="">כל השלבים</option>
                    {steps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="er-org">עמותה</Label>
                  <Select id="er-org" value={editing.orgId} onChange={(e) => setEditing({ ...editing, orgId: e.target.value })}>
                    <option value="">כל העמותות</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </Select>
                </div>
                {noScope && <p role="alert" className="text-sm text-destructive sm:col-span-2">&quot;כל השלבים&quot; ו&quot;כל העמותות&quot; זו השורה הראשונה בטבלה – בחרו שלב או עמותה.</p>}
                {taken && <p role="alert" className="text-sm text-destructive sm:col-span-2">כבר יש כלל לשלב ולעמותה האלה – ערכו אותו בטבלה.</p>}
              </div>
            )}
            <ExpiryRuleBuilder
              key={String(editing.index)}
              id="er-rule"
              value={editing.rule}
              onChange={(rule) => setEditing({ ...editing, rule })}
              dateFields={dateFieldsFor(scope)}
              bases={scope ? ["stepStart", "sent"] : ["sent"]}
              inherit={editing.index === "form" ? DEFAULT_TEXT : undefined}
            />
            {editing.index !== "form" && !editing.rule && <p className="text-sm text-muted-foreground">בחרו &quot;לפי כלל&quot; או &quot;ללא תוקף&quot;.</p>}
            <p className="text-xs text-muted-foreground">אחרי התאריך הקישור לא נפתח והבקשה מסומנת &quot;פג תוקף&quot; (אפשר להאריך). קישור של שלב פתוח לפחות 3 ימים מתחילת השלב.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>ביטול</Button>
              <Button type="button" onClick={apply} disabled={taken || noScope || incomplete}>{editing.index === -1 ? "הוספה לטבלה" : "עדכון"}</Button>
            </div>
          </div>
        )}
      </Dialog>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <Button type="button" onClick={onSave} disabled={state.kind === "saving" || !dirty || problems.length > 0 || waitingForForm}>
          {state.kind === "saving" && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
          {state.kind === "saving" ? "שומר…" : "שמירת הכללים"}
        </Button>
        <span aria-live="polite" className="text-sm">
          {state.kind === "saved" && !dirty ? (
            <span role="status" className="inline-flex items-center gap-1 text-success"><Check className="size-4" aria-hidden />הכללים נשמרו</span>
          ) : problems.length > 0 ? (
            <span className="text-destructive">יש {problems.length === 1 ? "כלל אחד" : `${problems.length} כללים`} לתקן</span>
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
