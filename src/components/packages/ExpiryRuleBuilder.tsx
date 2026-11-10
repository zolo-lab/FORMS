"use client";

import { useState } from "react";
import { ArrowLeft, CalendarClock, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_EXPIRY_DAYS, TODAY_FIELD, caseConditions, caseHolds, condNeeds, expiryFor, expiryRuleFields,
  type CondOp, type ExpiryBase, type ExpiryCalc, type ExpiryCase, type ExpiryCondition, type ExpiryOutcome, type ExpiryRule, type ExpirySnap,
} from "@/lib/requests/expiry";

/** `unavailable`: why the field cannot be used here (filled only later) – listed, but not chosen. */
export type DateFieldOption = { id: string; label: string; hint?: string; roles?: string[]; unavailable?: string };
const usableOf = (fields: DateFieldOption[]) => fields.filter((f) => !f.unavailable);
type BaseKind = "sent" | "stepStart";

const BASE_LABEL: Record<BaseKind, string> = { sent: "שליחת הבקשה", stepStart: "תחילת השלב" };
const SNAP_LABEL: Record<ExpirySnap["mode"], string> = {
  same: "בחודש של",
  next: "בחודש שאחרי",
  sameOrNext: "הקרוב אחרי",
};
/** The operators as offered, in groups; `label` is followed by the operator's value, then `suffix`. */
const COND_GROUPS: { title: string; ops: { op: CondOp; label: string; suffix?: string }[] }[] = [
  { title: "מול היום", ops: [
    { op: "today", label: "היום" }, { op: "beforeToday", label: "לפני היום" }, { op: "afterToday", label: "אחרי היום" },
    { op: "nextDays", label: "בימים הקרובים, עד", suffix: "ימים מהיום" }, { op: "lastDays", label: "בימים האחרונים, עד", suffix: "ימים אחורה" }, { op: "afterDays", label: "רחוק יותר מ־", suffix: "ימים מהיום" },
  ] },
  { title: "שבוע", ops: [{ op: "thisWeek", label: "בשבוע הנוכחי" }, { op: "nextWeek", label: "בשבוע הבא" }, { op: "lastWeek", label: "בשבוע שעבר" }] },
  { title: "חודש", ops: [
    { op: "thisMonth", label: "בחודש הנוכחי" }, { op: "nextMonth", label: "בחודש הבא" }, { op: "lastMonth", label: "בחודש שעבר" },
    { op: "dayLte", label: "עד ה־", suffix: "בחודש שלו" }, { op: "dayGt", label: "אחרי ה־", suffix: "בחודש שלו" },
  ] },
  { title: "רבעון ושנה", ops: [
    { op: "thisQuarter", label: "ברבעון הנוכחי" }, { op: "nextQuarter", label: "ברבעון הבא" }, { op: "lastQuarter", label: "ברבעון שעבר" },
    { op: "thisYear", label: "בשנה הנוכחית" }, { op: "nextYear", label: "בשנה הבאה" }, { op: "lastYear", label: "בשנה שעברה" },
  ] },
  { title: "תאריך מסוים", ops: [{ op: "on", label: "בתאריך" }, { op: "before", label: "לפני התאריך" }, { op: "after", label: "אחרי התאריך" }] },
  { title: "אחר", ops: [{ op: "blank", label: "ריק" }] },
];
const COND_OF = Object.fromEntries(COND_GROUPS.flatMap((g) => g.ops.map((o) => [o.op, o]))) as Record<CondOp, { op: CondOp; label: string; suffix?: string }>;
type Kind = "days" | "months" | "fixed" | "none";
const KIND_LABEL: Record<Kind, string> = { days: "לפי ימים", months: "לפי חודשים", fixed: "ביום קבוע בחודש", none: "ללא תוקף" };
const MAX_CASES = 10;
const fmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
/** Noon in Israel on a yyyy-mm-dd day, as the moment an example link is set. */
const noonOf = (day: string) => new Date(`${day}T10:00:00Z`);
const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v)) || 0));

/**
 * When the link closes, as one sentence after `lead` ("סגירת הקישור:" / "אז" / "אחרת"):
 * [לפי ימים] [7] ימים אחרי [תאריך] · [לפי חודשים] [1] חודשים אחרי [תאריך] · [ביום קבוע בחודש] ה־[7] [בחודש שאחרי]
 * [תאריך] · [ללא תוקף] (only where `allowNone`). An older rule that both adds time and moves to a fixed day shows as
 * a fixed day, with what it adds first noted.
 */
function OutcomeSentence({ id, lead, value, onChange, dateFields, bases, allowNone }: {
  id: string; lead: string; value: ExpiryOutcome; onChange: (v: ExpiryOutcome) => void; dateFields: DateFieldOption[]; bases: BaseKind[]; allowNone?: boolean;
}) {
  const calc = value.kind === "calc" ? value : null;
  const kind: Kind = !calc ? "none" : calc.snap ? "fixed" : calc.addMonths !== undefined && !calc.addDays ? "months" : "days";
  const base: ExpiryBase = calc?.base ?? ({ from: bases[0]! } as ExpiryBase);
  const setKind = (k: Kind) => {
    if (k === kind) return;
    if (k === "none") onChange({ kind: "none" });
    else if (k === "days") onChange({ kind: "calc", base, addDays: calc?.addDays || 7 });
    else if (k === "months") onChange({ kind: "calc", base, addMonths: calc?.addMonths || 1 });
    else onChange({ kind: "calc", base, snap: { day: 7, mode: "next" } });
  };
  const fieldId = base.from === "field" ? base.fieldId : null;
  const baseValue = fieldId !== null ? `field:${fieldId}` : base.from;
  const missing = !!calc && fieldId !== null && !usableOf(dateFields).some((f) => f.id === fieldId);
  const baseSelect = calc && (
    <Select id={`${id}-base`} aria-label="מאיזה תאריך" className="w-auto max-w-full" value={baseValue} onChange={(e) => {
      const v = e.target.value;
      onChange({ ...calc, base: v.startsWith("field:") ? { from: "field", fieldId: v.slice(6) } : { from: v as BaseKind } });
    }}>
      {bases.map((b) => <option key={b} value={b}>{BASE_LABEL[b]}</option>)}
      {dateFields.length > 0 && (
        <optgroup label="תאריך מהטופס">
          {dateFields.map((f) => <option key={f.id} value={`field:${f.id}`} disabled={!!f.unavailable}>{f.label}{f.unavailable ? ` – ${f.unavailable}` : ""}</option>)}
        </optgroup>
      )}
      {fieldId !== null && !dateFields.some((f) => f.id === fieldId) && <option value={baseValue}>שדה שלא זמין כאן</option>}
    </Select>
  );
  const extra = calc?.snap && (calc.addDays || calc.addMonths)
    ? [calc.addDays ? `${calc.addDays} ימים` : "", calc.addMonths ? `${calc.addMonths} חודשים` : ""].filter(Boolean).join(" ו-")
    : "";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        <span className="min-w-8 font-semibold">{lead}</span>
        <Select id={`${id}-kind`} aria-label="איך נקבעת סגירת הקישור" className="w-auto" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {(Object.keys(KIND_LABEL) as Kind[]).filter((k) => k !== "none" || allowNone).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </Select>
        {calc && kind === "days" && (
          <>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <Input id={`${id}-n`} aria-label="מספר ימים" type="number" min={0} max={3650} inputMode="numeric" className="w-20" value={calc.addDays ?? 0} onChange={(e) => onChange({ ...calc, addDays: num(e.target.value, 0, 3650) })} />
              ימים אחרי
            </span>
            {baseSelect}
          </>
        )}
        {calc && kind === "months" && (
          <>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <Input id={`${id}-n`} aria-label="מספר חודשים" type="number" min={0} max={120} inputMode="numeric" className="w-20" value={calc.addMonths ?? 0} onChange={(e) => onChange({ ...calc, addMonths: num(e.target.value, 0, 120) })} />
              חודשים אחרי
            </span>
            {baseSelect}
          </>
        )}
        {calc?.snap && (
          <>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              ה־
              <Input id={`${id}-n`} aria-label="היום בחודש" type="number" min={1} max={31} inputMode="numeric" className="w-20" value={calc.snap.day} onChange={(e) => onChange({ ...calc, snap: { ...calc.snap!, day: num(e.target.value, 1, 31) } })} />
            </span>
            <Select id={`${id}-month`} aria-label="באיזה חודש" className="w-auto min-w-0 max-w-full" value={calc.snap.mode} onChange={(e) => onChange({ ...calc, snap: { ...calc.snap!, mode: e.target.value as ExpirySnap["mode"] } })}>
              {(Object.keys(SNAP_LABEL) as ExpirySnap["mode"][]).map((k) => <option key={k} value={k}>{SNAP_LABEL[k]}</option>)}
            </Select>
            {baseSelect}
          </>
        )}
      </div>
      {extra && <p className="text-xs text-muted-foreground">אחרי שמוסיפים {extra} לתאריך (מכלל קודם). שינוי הסוג מבטל את התוספת.</p>}
      {calc?.snap?.day === 31 && <p className="text-xs text-muted-foreground">31 = היום האחרון בחודש.</p>}
      {missing && (
        <p role="alert" className="text-sm text-destructive">התאריך שנבחר לא זמין כאן (נמחק, או שממלאים אותו מאוחר יותר). בחרו אחר – בלי תאריך תקין נספרים {calc!.fallbackDays ?? DEFAULT_EXPIRY_DAYS} ימים.</p>
      )}
    </div>
  );
}

/**
 * One line of a condition: "[אם | וגם] [a date field of the form] [הוא | אינו] [היום | בחודש הבא | לפני התאריך … | …]".
 * The current date can be checked too, by its day of the month.
 */
function ConditionSentence({ id, lead, value, onChange, dateFields, onRemove }: {
  id: string; lead: string; value: ExpiryCondition; onChange: (v: ExpiryCondition) => void; dateFields: DateFieldOption[]; onRemove?: () => void;
}) {
  const needs = condNeeds(value.op);
  const isToday = value.fieldId === TODAY_FIELD;
  const setOp = (op: CondOp) => {
    const n = condNeeds(op);
    onChange({
      fieldId: value.fieldId, op, ...(value.not ? { not: true } : {}),
      ...(n === "day" ? { n: needs === "day" ? value.n : 20 } : n === "days" ? { n: needs === "days" ? value.n : 7 } : n === "date" ? { date: value.date ?? ymd(new Date()) } : {}),
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-8 font-semibold">{lead}</span>
      <Select id={`${id}-field`} aria-label="איזה תאריך בודקים" className="w-auto max-w-full" value={value.fieldId} onChange={(e) => {
        const fieldId = e.target.value;
        // The current date is checked only by its day of the month.
        onChange(fieldId === TODAY_FIELD && needs !== "day" ? { fieldId, op: "dayLte", n: 20, ...(value.not ? { not: true } : {}) } : { ...value, fieldId });
      }}>
        {!isToday && !dateFields.some((f) => f.id === value.fieldId) && <option value={value.fieldId}>{value.fieldId ? "שדה שכבר לא קיים" : "בחרו שדה תאריך…"}</option>}
        {dateFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        {isToday && <option value={TODAY_FIELD}>התאריך הנוכחי</option>}
      </Select>
      <Select id={`${id}-not`} aria-label="הוא או אינו" className="w-auto" value={value.not ? "not" : "is"} onChange={(e) => { const c = { ...value }; if (e.target.value === "not") c.not = true; else delete c.not; onChange(c); }}>
        <option value="is">הוא</option>
        <option value="not">אינו</option>
      </Select>
      <Select id={`${id}-op`} aria-label="התנאי" className="w-auto max-w-full" value={value.op} onChange={(e) => setOp(e.target.value as CondOp)}>
        {COND_GROUPS.map((g) => {
          const ops = g.ops.filter((o) => !isToday || condNeeds(o.op) === "day");
          return ops.length ? <optgroup key={g.title} label={g.title}>{ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}</optgroup> : null;
        })}
      </Select>
      {needs && (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          {needs === "date"
            ? <Input id={`${id}-v`} aria-label="התאריך" type="date" className="w-40" value={value.date ?? ""} onChange={(e) => onChange({ ...value, date: e.target.value })} />
            : <Input id={`${id}-v`} aria-label={needs === "day" ? "יום בחודש" : "מספר ימים"} type="number" min={needs === "day" ? 1 : 0} max={needs === "day" ? 31 : 3650} inputMode="numeric" className="w-20" value={value.n ?? 0} onChange={(e) => onChange({ ...value, n: num(e.target.value, needs === "day" ? 1 : 0, needs === "day" ? 31 : 3650) })} />}
          {COND_OF[value.op].suffix}
        </span>
      )}
      {onRemove && <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" onClick={onRemove} aria-label="הסרת השורה"><X className="size-4" aria-hidden /></Button>}
    </div>
  );
}

/** The calculation of one rule on example dates, step by step: from → after adding → after moving to the fixed day. */
function Trail({ calc, answers, start, fieldName }: { calc: ExpiryCalc; answers: Record<string, string>; start: Date; fieldName: (id: string) => string }) {
  const at = { sent: start, start, today: start };
  const fromLabel = calc.base.from === "field" ? fieldName(calc.base.fieldId) : BASE_LABEL[calc.base.from];
  const fromDay = calc.base.from === "field" ? answers[calc.base.fieldId] : ymd(start);
  if (!fromDay) return null;
  // Nothing added and no fixed day: the date itself (the rule is not complete yet, so not worked out).
  const added = calc.addDays || calc.addMonths ? expiryFor({ ...calc, snap: undefined }, answers, at) : noonOf(fromDay);
  const final = expiryFor(calc, answers, at);
  const unit = calc.addMonths && !calc.addDays ? `${calc.addMonths} חודשים` : `${calc.addDays ?? 0} ימים${calc.addMonths ? ` ו-${calc.addMonths} חודשים` : ""}`;
  const chip = (label: string, date: Date | null, strong = false) => (
    <span className={cn("inline-flex flex-col rounded-md border bg-background px-2 py-1", strong && "border-primary")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", strong && "font-semibold text-primary")}>{date ? fmt.format(date) : "—"}</span>
    </span>
  );
  const arrow = <ArrowLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {chip(fromLabel, noonOf(fromDay))}
      {(!calc.snap || !!calc.addDays || !!calc.addMonths) && <>{arrow}{chip(`+ ${unit}`, added, !calc.snap)}</>}
      {calc.snap && <>{arrow}{chip(`ה־${calc.snap.day} ${calc.snap.mode === "next" ? "בחודש שאחרי" : calc.snap.mode === "same" ? "באותו חודש" : "הקרוב"}`, final, true)}</>}
    </div>
  );
}

/**
 * "תוקף הקישור": a closed choice – [the default | no expiry | a simple rule | a complex rule] – whose chosen option
 * opens. A simple rule reads as a sentence ("הקישור נסגר 7 ימים אחרי תחילת
 * השלב, ואז ביום 20 באותו חודש"), and may differ by conditions on a date of the form ("אם תאריך התחילה חל עד ה-20 →
 * …; בכל מקרה אחר → …"), so Make's rules are built here. Under it, the calculation on example dates, step by step.
 * `inherit`: the label of "follow the default".
 */
export function ExpiryRuleBuilder({ id, value, onChange, dateFields, bases, inherit }: {
  id: string;
  value: ExpiryRule | undefined;
  onChange: (rule: ExpiryRule | undefined) => void;
  dateFields: DateFieldOption[];
  bases: BaseKind[];
  inherit?: string;
}) {
  type Mode = "inherit" | "none" | "simple" | "complex";
  const mode: Mode = !value ? "inherit" : value.kind === "none" ? "none" : value.kind === "cases" ? "complex" : "simple";
  const fresh = (): ExpiryCalc => ({ kind: "calc", base: { from: bases[0]! } as ExpiryBase, addDays: bases[0] === "stepStart" ? 7 : 30 });
  const cases: ExpiryCase[] = value?.kind === "cases" ? value.cases : [];
  const otherwise: ExpiryOutcome | null = value?.kind === "cases" ? value.otherwise : value?.kind === "calc" ? value : null;
  // Conditions are checked again every day, so they (and what they lead to) may read a date a later step fills.
  const anyDate = dateFields.map((f) => ({ id: f.id, label: f.label }));
  const newCondition = (): ExpiryCondition => ({ fieldId: anyDate[0]?.id ?? "", op: "thisMonth" });
  const newCase = (): ExpiryCase => ({ when: newCondition(), then: otherwise?.kind === "calc" ? otherwise : fresh() });
  const setCases = (next: ExpiryCase[], other: ExpiryOutcome = otherwise ?? fresh()) => onChange(next.length ? { kind: "cases", cases: next, otherwise: other } : other);
  const fieldName = (fid: string) => dateFields.find((f) => f.id === fid)?.label ?? "שדה שלא זמין כאן";
  const pick = (m: Mode) => {
    if (m === mode) return;
    if (m === "inherit") onChange(undefined);
    else if (m === "none") onChange({ kind: "none" });
    else if (m === "simple") onChange(otherwise?.kind === "calc" ? otherwise : fresh());
    else onChange({ kind: "cases", cases: [newCase()], otherwise: otherwise ?? fresh() });
  };

  // Example dates: the moment the link is set ("today"), and each date field the rule reads.
  const used = value ? expiryRuleFields(value) : [];
  const [startDay, setStartDay] = useState(() => ymd(new Date()));
  const [examples, setExamples] = useState<Record<string, string>>({});
  const answers: Record<string, string> = Object.fromEntries(used.map((f) => [f, examples[f] ?? startDay]));
  const start = noonOf(startDay);
  const chosen = cases.findIndex((c) => caseHolds(c, answers, start));
  const outcome = chosen >= 0 ? cases[chosen]!.then : otherwise;

  const options: { id: Mode; title: string; hint: string }[] = [
    ...(inherit ? [{ id: "inherit" as const, title: "ברירת מחדל", hint: inherit }] : []),
    { id: "none", title: "ללא תוקף", hint: "הקישור לא נסגר." },
    { id: "simple", title: "תנאי פשוט", hint: "כלל אחד – למשל 7 ימים אחרי תחילת השלב, או ה-7 בחודש שאחרי תאריך התחילה." },
    { id: "complex", title: "תנאי מורכב", hint: anyDate.length ? "כלל שונה לפי מקרה: אם [שדה תאריך] הוא… אז…, אחרת…" : "תנאי בודק שדה תאריך מהטופס, ואין בטופס שדה כזה. הוסיפו שדה תאריך בלשונית העריכה." },
  ];

  const example = value && (mode === "simple" || mode === "complex") && (
    <details className="rounded-lg bg-muted/50 p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><CalendarClock className="size-4 shrink-0 text-primary" aria-hidden />דוגמה: איך זה מחושב</summary>
      <div className="mt-3 space-y-3" aria-live="polite">
        <div className="flex flex-wrap gap-3">
          <span className="flex items-center gap-2 text-sm">
            <Label htmlFor={`${id}-ex-start`} className="font-normal text-muted-foreground">{bases.includes("stepStart") ? "השלב מתחיל ב־" : "נשלח ב־"}</Label>
            <Input id={`${id}-ex-start`} type="date" value={startDay} onChange={(e) => e.target.value && setStartDay(e.target.value)} className="h-9 w-40" />
          </span>
          {used.map((f) => (
            <span key={f} className="flex items-center gap-2 text-sm">
              <Label htmlFor={`${id}-ex-${f}`} className="font-normal text-muted-foreground">{fieldName(f)}:</Label>
              <Input id={`${id}-ex-${f}`} type="date" value={answers[f]} onChange={(e) => setExamples({ ...examples, [f]: e.target.value })} className="h-9 w-40" />
            </span>
          ))}
        </div>
        {cases.length > 0 && <p className="text-sm text-muted-foreground">חל: <strong className="text-foreground">{chosen >= 0 ? `"אם" מספר ${chosen + 1}` : "אחרת"}</strong></p>}
        {outcome?.kind === "calc" ? <Trail calc={outcome} answers={answers} start={start} fieldName={fieldName} /> : <p className="text-sm font-medium">הקישור לא נסגר.</p>}
      </div>
    </details>
  );

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-1.5 text-sm font-medium">תוקף הקישור</legend>
      <div role="radiogroup" aria-label="תוקף הקישור" className="space-y-2">
        {options.map((o) => {
          const on = mode === o.id;
          return (
            <div key={o.id} className={cn("rounded-lg border", on ? "border-primary bg-primary/5" : "bg-card")}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(o.id)}
                disabled={o.id === "complex" && !on && anyDate.length === 0}
                className="flex min-h-12 w-full items-start gap-3 p-3 text-start disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2", on ? "border-primary" : "border-muted-foreground/50")} aria-hidden>
                  {on && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{o.title}</span>
                  {!(on && (o.id === "simple" || o.id === "complex")) && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
                </span>
              </button>

              {on && o.id === "simple" && otherwise?.kind === "calc" && (
                <div className="space-y-3 border-t p-3">
                  <OutcomeSentence id={`${id}-simple`} lead="סגירת הקישור:" value={otherwise} onChange={onChange} dateFields={dateFields} bases={bases} />
                  {example}
                </div>
              )}

              {on && o.id === "complex" && otherwise && (
                <div className="space-y-3 border-t p-3">
                  {cases.map((c, k) => (
                    <section key={k} aria-label={`מקרה ${k + 1}`} className="flex items-start gap-2 rounded-lg border bg-card p-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        {caseConditions(c).map((cond, n) => (
                          <ConditionSentence
                            key={n}
                            id={`${id}-c${k}-${n}`}
                            lead={n === 0 ? "אם" : "וגם"}
                            value={cond}
                            dateFields={anyDate}
                            onChange={(next) => setCases(cases.map((x, j) => (j !== k ? x : n === 0 ? { ...x, when: next } : { ...x, and: (x.and ?? []).map((y, m) => (m === n - 1 ? next : y)) })))}
                            onRemove={n === 0 ? undefined : () => setCases(cases.map((x, j) => {
                              if (j !== k) return x;
                              const and = (x.and ?? []).filter((_, m) => m !== n - 1);
                              const copy = { ...x, and };
                              if (!and.length) delete (copy as Partial<ExpiryCase>).and;
                              return copy;
                            }))}
                          />
                        ))}
                        <button type="button" disabled={(c.and?.length ?? 0) >= 9} onClick={() => setCases(cases.map((x, j) => (j === k ? { ...x, and: [...(x.and ?? []), newCondition()] } : x)))} className="ms-10 min-h-8 text-xs text-primary hover:underline disabled:opacity-50">+ וגם</button>
                        <OutcomeSentence id={`${id}-t${k}`} lead="אז" value={c.then} onChange={(then) => setCases(cases.map((x, j) => (j === k ? { ...x, then } : x)))} dateFields={anyDate} bases={bases} allowNone />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={cases.length === 1} onClick={() => setCases(cases.filter((_, j) => j !== k))} aria-label={`מחיקת מקרה ${k + 1}`}><Trash2 className="size-4" aria-hidden /></Button>
                    </section>
                  ))}
                  <section aria-label="אחרת" className="rounded-lg border bg-card p-3">
                    <OutcomeSentence id={`${id}-else`} lead="אחרת" value={otherwise} onChange={(other) => setCases(cases, other)} dateFields={anyDate} bases={bases} allowNone />
                  </section>
                  <Button type="button" variant="ghost" size="sm" className="text-primary" disabled={cases.length >= MAX_CASES} onClick={() => setCases([...cases, newCase()])}>
                    <Plus className="size-4" aria-hidden />עוד &quot;אם&quot;
                  </Button>
                  <p className="text-xs text-muted-foreground">ה&quot;אם&quot; הראשון שמתקיים קובע. התנאים נבדקים מחדש כל יום, והתוקף מתעדכן לפיהם.</p>
                  {example}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
