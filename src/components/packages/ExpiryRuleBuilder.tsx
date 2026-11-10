"use client";

import { useState } from "react";
import { ArrowLeft, CalendarClock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  COND_PERIODS, COND_TEXT, COND_UNITS, DEFAULT_EXPIRY_DAYS, PERIOD_TEXT, TODAY_FIELD, UNIT_TEXT, caseHolds, condNeeds, expiryFor, expiryRuleFields,
  type CondOp, type CondPeriod, type CondUnit, type ExpiryBase, type ExpiryCalc, type ExpiryCase, type ExpiryCondition, type ExpiryOutcome, type ExpiryRule, type ExpirySnap,
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
/** The operators as offered: Tadabase's list, in its order and groups, and the day of the month after it. */
const COND_GROUPS: { title: string; ops: CondOp[] }[] = [
  { title: "היום", ops: ["today", "notToday", "beforeToday", "afterToday", "todayOrBefore", "todayOrAfter"] },
  { title: "התקופה הנוכחית", ops: ["thisWeek", "notThisWeek", "thisMonth", "notThisMonth", "thisQuarter", "notThisQuarter", "thisYear", "notThisYear"] },
  { title: "התקופה הקודמת", ops: ["lastWeek", "notLastWeek", "lastMonth", "notLastMonth", "lastQuarter", "notLastQuarter", "lastYear", "notLastYear"] },
  { title: "התקופה הבאה", ops: ["nextWeek", "notNextWeek", "nextMonth", "notNextMonth", "nextQuarter", "notNextQuarter", "nextYear", "notNextYear"] },
  { title: "טווח", ops: ["duringCurrent", "duringPrevious", "duringNext", "beforePrevious", "afterNext"] },
  { title: "תאריך מסוים", ops: ["is", "isNot", "before", "after", "onOrBefore", "onOrAfter"] },
  { title: "ריק", ops: ["blank", "notBlank"] },
  { title: "יום בחודש", ops: ["dayLte", "dayGt"] },
];
/** The names in the list of the operators that take a value (the value comes right after); the rest read as they are. */
const OP_LABEL: Partial<Record<CondOp, string>> = {
  duringCurrent: "במהלך", duringPrevious: "בטווח האחרון של", duringNext: "בטווח הקרוב של", beforePrevious: "לפני יותר מ־", afterNext: "בעוד יותר מ־",
  is: "שווה ל־", isNot: "שונה מ־", before: "לפני", after: "אחרי", onOrBefore: "עד (כולל)", onOrAfter: "החל מ־ (כולל)",
  dayLte: "עד ה־", dayGt: "אחרי ה־",
};
const opLabel = (op: CondOp) => OP_LABEL[op] ?? COND_TEXT[op];
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
 * One condition, as a filter row: [a date field of the form] [operator] [its value, when it takes one] [remove].
 * The value is a period (week…year), a number with a unit, a given date or another date field, or a day of the month.
 */
function ConditionRow({ id, value, onChange, dateFields, onRemove }: {
  id: string; value: ExpiryCondition; onChange: (v: ExpiryCondition) => void; dateFields: DateFieldOption[]; onRemove?: () => void;
}) {
  const needs = condNeeds(value.op);
  const setOp = (op: CondOp) => {
    const n = condNeeds(op);
    const next: ExpiryCondition = { fieldId: value.fieldId, op };
    if (n === "day") next.n = needs === "day" ? value.n : 20;
    if (n === "span") { next.n = needs === "span" ? value.n : 7; next.unit = value.unit ?? "days"; }
    if (n === "period") next.period = value.period ?? "month";
    if (n === "date") { if (value.otherFieldId) next.otherFieldId = value.otherFieldId; else next.date = value.date ?? ymd(new Date()); }
    onChange(next);
  };
  const others = dateFields.filter((f) => f.id !== value.fieldId);
  return (
    <div className="flex items-start gap-2 text-sm">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <Select id={`${id}-field`} aria-label="שדה התאריך" className="w-auto max-w-full" value={value.fieldId} onChange={(e) => onChange({ ...value, fieldId: e.target.value })}>
        {!dateFields.some((f) => f.id === value.fieldId) && <option value={value.fieldId}>{value.fieldId === TODAY_FIELD ? "התאריך הנוכחי" : value.fieldId ? "שדה שכבר לא קיים" : "בחרו שדה תאריך…"}</option>}
        {dateFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </Select>
      <Select id={`${id}-op`} aria-label="התנאי" className="w-auto max-w-full" value={value.op} onChange={(e) => setOp(e.target.value as CondOp)}>
        {COND_GROUPS.map((g) => <optgroup key={g.title} label={g.title}>{g.ops.map((op) => <option key={op} value={op}>{opLabel(op)}</option>)}</optgroup>)}
      </Select>
      {needs === "period" && (
        <Select id={`${id}-period`} aria-label="התקופה" className="w-auto" value={value.period ?? "month"} onChange={(e) => onChange({ ...value, period: e.target.value as CondPeriod })}>
          {COND_PERIODS.map((p) => <option key={p} value={p}>{PERIOD_TEXT[p]}</option>)}
        </Select>
      )}
      {needs === "span" && (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <Input id={`${id}-n`} aria-label="כמה" type="number" min={0} max={3650} inputMode="numeric" className="w-20" value={value.n ?? 0} onChange={(e) => onChange({ ...value, n: num(e.target.value, 0, 3650) })} />
          <Select id={`${id}-unit`} aria-label="יחידה" className="w-auto" value={value.unit ?? "days"} onChange={(e) => onChange({ ...value, unit: e.target.value as CondUnit })}>
            {COND_UNITS.map((u) => <option key={u} value={u}>{UNIT_TEXT[u]}</option>)}
          </Select>
        </span>
      )}
      {needs === "day" && (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <Input id={`${id}-n`} aria-label="יום בחודש" type="number" min={1} max={31} inputMode="numeric" className="w-20" value={value.n ?? 1} onChange={(e) => onChange({ ...value, n: num(e.target.value, 1, 31) })} />
          בחודש
        </span>
      )}
      {needs === "date" && (
        <>
          <Select id={`${id}-vs`} aria-label="מול מה" className="w-auto" value={value.otherFieldId ? "field" : "date"} onChange={(e) => {
            const next = { ...value };
            if (e.target.value === "field") { delete next.date; next.otherFieldId = others[0]?.id ?? ""; } else { delete next.otherFieldId; next.date = ymd(new Date()); }
            onChange(next);
          }}>
            <option value="date">תאריך מסוים</option>
            <option value="field" disabled={others.length === 0}>שדה תאריך אחר</option>
          </Select>
          {value.otherFieldId !== undefined
            ? (
              <Select id={`${id}-other`} aria-label="השדה האחר" className="w-auto max-w-full" value={value.otherFieldId} onChange={(e) => onChange({ ...value, otherFieldId: e.target.value })}>
                {!others.some((f) => f.id === value.otherFieldId) && <option value={value.otherFieldId}>{value.otherFieldId ? "שדה שכבר לא קיים" : "בחרו…"}</option>}
                {others.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </Select>
            )
            : <Input id={`${id}-date`} aria-label="התאריך" type="date" className="w-40" value={value.date ?? ""} onChange={(e) => onChange({ ...value, date: e.target.value })} />}
        </>
      )}
      </div>
      {onRemove && <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={onRemove} aria-label="מחיקת התנאי"><Trash2 className="size-4" aria-hidden /></Button>}
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
  const newCase = (): ExpiryCase => ({ conditions: [newCondition()], then: otherwise?.kind === "calc" ? otherwise : fresh() });
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
    { id: "complex", title: "תנאי מורכב", hint: anyDate.length ? "תנאים על שדות התאריך בטופס: אם… אז…, אחרת…" : "תנאי בודק שדה תאריך מהטופס, ואין בטופס שדה כזה. הוסיפו שדה תאריך בלשונית העריכה." },
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
        {cases.length > 0 && <p className="text-sm text-muted-foreground">חל: <strong className="text-foreground">{chosen >= 0 ? `קבוצת תנאים ${chosen + 1}` : "אחרת"}</strong></p>}
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
                  {cases.map((c, k) => {
                    const setCase = (next: ExpiryCase) => setCases(cases.map((x, j) => (j === k ? next : x)));
                    return (
                      <section key={k} aria-label={`קבוצת תנאים ${k + 1}`} className="rounded-lg border bg-card">
                        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                          <span className="text-sm font-semibold">אם</span>
                          <div role="group" aria-label="איך התנאים מצטרפים" className="inline-flex rounded-md border p-0.5">
                            {([["all", "כל התנאים מתקיימים"], ["any", "אחד מהתנאים מתקיים"]] as const).map(([m, text]) => (
                              <button key={m} type="button" aria-pressed={(c.match ?? "all") === m} onClick={() => { const next = { ...c }; if (m === "any") next.match = "any"; else delete next.match; setCase(next); }}
                                className={cn("min-h-8 rounded px-2.5 text-xs font-medium", (c.match ?? "all") === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
                                {text}
                              </button>
                            ))}
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="ms-auto text-destructive" disabled={cases.length === 1} onClick={() => setCases(cases.filter((_, j) => j !== k))} aria-label={`מחיקת קבוצת תנאים ${k + 1}`}><Trash2 className="size-4" aria-hidden /></Button>
                        </div>
                        <div className="space-y-2 p-3">
                          {c.conditions.map((cond, n) => (
                            <ConditionRow
                              key={n}
                              id={`${id}-c${k}-${n}`}
                              value={cond}
                              dateFields={anyDate}
                              onChange={(next) => setCase({ ...c, conditions: c.conditions.map((y, m) => (m === n ? next : y)) })}
                              onRemove={c.conditions.length > 1 ? () => setCase({ ...c, conditions: c.conditions.filter((_, m) => m !== n) }) : undefined}
                            />
                          ))}
                          <Button type="button" variant="outline" size="sm" disabled={c.conditions.length >= 20} onClick={() => setCase({ ...c, conditions: [...c.conditions, newCondition()] })}>
                            <Plus className="size-4" aria-hidden />תנאי נוסף
                          </Button>
                        </div>
                        <div className="border-t bg-muted/30 p-3">
                          <OutcomeSentence id={`${id}-t${k}`} lead="אז" value={c.then} onChange={(then) => setCase({ ...c, then })} dateFields={anyDate} bases={bases} allowNone />
                        </div>
                      </section>
                    );
                  })}
                  <Button type="button" variant="ghost" size="sm" className="text-primary" disabled={cases.length >= MAX_CASES} onClick={() => setCases([...cases, newCase()])}>
                    <Plus className="size-4" aria-hidden />קבוצת תנאים נוספת
                  </Button>
                  <section aria-label="אחרת" className="rounded-lg border bg-card p-3">
                    <OutcomeSentence id={`${id}-else`} lead="אחרת" value={otherwise} onChange={(other) => setCases(cases, other)} dateFields={anyDate} bases={bases} allowNone />
                  </section>
                  <p className="text-xs text-muted-foreground">הקבוצה הראשונה שמתקיימת קובעת. התנאים נבדקים מחדש כל יום, והתוקף מתעדכן לפיהם.</p>
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
