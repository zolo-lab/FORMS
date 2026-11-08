"use client";

import { useState } from "react";
import { ArrowLeft, CalendarClock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_EXPIRY_DAYS, describeExpiryRule, expiryFor, expiryRuleFields, holds,
  type ExpiryBase, type ExpiryCalc, type ExpiryCase, type ExpiryCondition, type ExpiryOutcome, type ExpiryRule, type ExpirySnap,
} from "@/lib/requests/expiry";

/** `unavailable`: why the field cannot be used here (filled only later) – listed, but not chosen. */
export type DateFieldOption = { id: string; label: string; hint?: string; roles?: string[]; unavailable?: string };
const usableOf = (fields: DateFieldOption[]) => fields.filter((f) => !f.unavailable);
type BaseKind = "sent" | "stepStart";

const BASE_LABEL: Record<BaseKind, string> = { sent: "שליחת הבקשה", stepStart: "תחילת השלב" };
const SNAP_LABEL: Record<ExpirySnap["mode"], string> = {
  same: "באותו חודש",
  next: "בחודש שאחריו",
  sameOrNext: "באותו חודש, ואם כבר עבר – בחודש שאחריו",
};
type CondKey = "day-lte" | "day-gt" | "today-past" | "today-within" | "today-beyond";
const COND_LABEL: Record<CondKey, string> = {
  "day-lte": "חל עד היום ה־… בחודש",
  "day-gt": "חל אחרי היום ה־… בחודש",
  "today-past": "כבר עבר",
  "today-within": "בעוד … ימים או פחות",
  "today-beyond": "בעוד יותר מ־… ימים",
};
const condKey = (c: ExpiryCondition): CondKey => `${c.type}-${c.op}` as CondKey;
const MAX_CASES = 10;
const fmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
/** Noon in Israel on a yyyy-mm-dd day, as the moment an example link is set. */
const noonOf = (day: string) => new Date(`${day}T10:00:00Z`);
const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v)) || 0));

/**
 * One rule as a sentence: "הקישור נסגר [7] [ימים] אחרי [תחילת השלב]", and optionally "ואז ביום [20] [באותו חודש]".
 * `amount + unit` stand for addDays or addMonths (an older rule with both shows its days and keeps its months).
 */
function RuleSentence({ id, value, onChange, dateFields, bases }: { id: string; value: ExpiryCalc; onChange: (v: ExpiryCalc) => void; dateFields: DateFieldOption[]; bases: BaseKind[] }) {
  const set = (patch: Partial<ExpiryCalc>) => {
    const next: ExpiryCalc = { ...value, ...patch };
    for (const k of ["addDays", "addMonths", "snap"] as const) if (!next[k]) delete next[k];
    onChange(next);
  };
  const unit: "days" | "months" = value.addMonths && !value.addDays ? "months" : "days";
  const amount = unit === "months" ? value.addMonths! : (value.addDays ?? 0);
  const fieldId = value.base.from === "field" ? value.base.fieldId : null;
  const baseValue = fieldId !== null ? `field:${fieldId}` : value.base.from;
  const missing = fieldId !== null && !usableOf(dateFields).some((f) => f.id === fieldId);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        <span className="font-medium">הקישור נסגר</span>
        <Input id={`${id}-amount`} aria-label="כמה" type="number" min={0} max={3650} inputMode="numeric" className="w-20" value={amount}
          onChange={(e) => { const n = num(e.target.value, 0, unit === "months" ? 120 : 3650); set(unit === "months" ? { addMonths: n } : { addDays: n }); }} />
        <Select id={`${id}-unit`} aria-label="יחידה" className="w-auto" value={unit}
          onChange={(e) => set(e.target.value === "months" ? { addMonths: amount, addDays: undefined } : { addDays: amount, addMonths: undefined })}>
          <option value="days">ימים</option>
          <option value="months">חודשים</option>
        </Select>
        <span className="font-medium">אחרי</span>
        <Select id={`${id}-base`} aria-label="אחרי מה" className="w-auto min-w-0 max-w-full flex-1" value={baseValue} onChange={(e) => {
          const v = e.target.value;
          set({ base: v.startsWith("field:") ? { from: "field", fieldId: v.slice(6) } : { from: v as BaseKind } });
        }}>
          {bases.map((b) => <option key={b} value={b}>{BASE_LABEL[b]}</option>)}
          {dateFields.length > 0 && (
            <optgroup label="תאריך מהטופס">
              {dateFields.map((f) => <option key={f.id} value={`field:${f.id}`} disabled={!!f.unavailable}>{f.label}{f.unavailable ? ` – ${f.unavailable}` : ""}</option>)}
            </optgroup>
          )}
          {fieldId !== null && !dateFields.some((f) => f.id === fieldId) && <option value={baseValue}>שדה שלא זמין כאן</option>}
        </Select>
      </div>
      {unit === "days" && !!value.addMonths && <p className="text-xs text-muted-foreground">ועוד {value.addMonths} חודשים (מכלל קודם).</p>}
      {missing && (
        <p role="alert" className="text-sm text-destructive">התאריך שנבחר לא זמין כאן (נמחק, או שממלאים אותו מאוחר יותר). בחרו אחר – בלי תאריך תקין נספרים {value.fallbackDays ?? DEFAULT_EXPIRY_DAYS} ימים.</p>
      )}

      <div className="space-y-2">
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <Checkbox checked={!!value.snap} onChange={(e) => set({ snap: e.target.checked ? { day: value.snap?.day ?? 20, mode: value.snap?.mode ?? "same" } : undefined })} />
          ואז להעביר ליום קבוע בחודש
        </label>
        {value.snap && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 ps-7 text-sm">
            <Label htmlFor={`${id}-day`}>ליום</Label>
            <Input id={`${id}-day`} type="number" min={1} max={31} inputMode="numeric" className="w-20" value={value.snap.day} onChange={(e) => set({ snap: { ...value.snap!, day: num(e.target.value, 1, 31) } })} />
            <Select id={`${id}-snap`} aria-label="באיזה חודש" className="w-auto min-w-0 max-w-full flex-1" value={value.snap.mode} onChange={(e) => set({ snap: { ...value.snap!, mode: e.target.value as ExpirySnap["mode"] } })}>
              {(Object.keys(SNAP_LABEL) as ExpirySnap["mode"][]).map((k) => <option key={k} value={k}>{SNAP_LABEL[k]}</option>)}
            </Select>
            {value.snap.day === 31 && <span className="basis-full text-xs text-muted-foreground">31 = היום האחרון בחודש.</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** What a condition (or "otherwise") leads to: a rule, or no expiry. */
function OutcomeEditor({ id, value, onChange, dateFields, bases, fresh }: { id: string; value: ExpiryOutcome; onChange: (v: ExpiryOutcome) => void; dateFields: DateFieldOption[]; bases: BaseKind[]; fresh: () => ExpiryCalc }) {
  return (
    <div className="space-y-3">
      <Select id={`${id}-kind`} aria-label="התוצאה" className="w-auto" value={value.kind} onChange={(e) => onChange(e.target.value === "none" ? { kind: "none" } : fresh())}>
        <option value="calc">הקישור נסגר לפי כלל</option>
        <option value="none">הקישור לא פג</option>
      </Select>
      {value.kind === "calc" && <RuleSentence id={id} value={value} onChange={onChange} dateFields={dateFields} bases={bases} />}
    </div>
  );
}

/** "אם [date field] [is …]": the day of its month against a number, or the date against today. */
function ConditionEditor({ id, value, onChange, dateFields }: { id: string; value: ExpiryCondition; onChange: (v: ExpiryCondition) => void; dateFields: DateFieldOption[] }) {
  const setKey = (k: CondKey) => {
    const [type, op] = k.split("-") as [ExpiryCondition["type"], string];
    onChange(type === "day"
      ? { type: "day", fieldId: value.fieldId, op: op as "lte" | "gt", day: value.type === "day" ? value.day : 20 }
      : op === "past" ? { type: "today", fieldId: value.fieldId, op: "past" } : { type: "today", fieldId: value.fieldId, op: op as "within" | "beyond", days: value.type === "today" ? (value.days ?? 7) : 7 });
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">אם</span>
        <Select id={`${id}-field`} aria-label="שדה התאריך בתנאי" className="w-auto min-w-0 max-w-full" value={value.fieldId} onChange={(e) => onChange({ ...value, fieldId: e.target.value })}>
          {!dateFields.some((f) => f.id === value.fieldId) && <option value={value.fieldId}>{value.fieldId ? "שדה שלא זמין כאן" : "בחרו תאריך…"}</option>}
          {dateFields.map((f) => <option key={f.id} value={f.id} disabled={!!f.unavailable}>{f.label}{f.unavailable ? ` – ${f.unavailable}` : ""}</option>)}
        </Select>
        <Select id={`${id}-op`} aria-label="התנאי" className="w-auto min-w-0 max-w-full" value={condKey(value)} onChange={(e) => setKey(e.target.value as CondKey)}>
          {(Object.keys(COND_LABEL) as CondKey[]).map((k) => <option key={k} value={k}>{COND_LABEL[k].replace("…", "N")}</option>)}
        </Select>
        {value.type === "day" && (
          <Input id={`${id}-n`} aria-label="היום בחודש" type="number" min={1} max={31} inputMode="numeric" className="w-20" value={value.day} onChange={(e) => onChange({ ...value, day: num(e.target.value, 1, 31) })} />
        )}
        {value.type === "today" && value.op !== "past" && (
          <Input id={`${id}-n`} aria-label="מספר ימים" type="number" min={0} max={3650} inputMode="numeric" className="w-20" value={value.days ?? 0} onChange={(e) => onChange({ ...value, days: num(e.target.value, 0, 3650) })} />
        )}
      </div>
      {value.type === "today" && <p className="text-xs text-muted-foreground">נבדק מול התאריך של כל יום מחדש – כשהמצב משתנה, התוקף מתעדכן.</p>}
    </div>
  );
}

/** The calculation of one rule on example dates, step by step: from → after adding → after moving to the fixed day. */
function Trail({ calc, answers, start, fieldName }: { calc: ExpiryCalc; answers: Record<string, string>; start: Date; fieldName: (id: string) => string }) {
  const at = { sent: start, start, today: start };
  const fromLabel = calc.base.from === "field" ? fieldName(calc.base.fieldId) : BASE_LABEL[calc.base.from];
  const fromDay = calc.base.from === "field" ? answers[calc.base.fieldId] : ymd(start);
  if (!fromDay) return null;
  const added = expiryFor({ ...calc, snap: undefined }, answers, at);
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
      {arrow}
      {chip(`+ ${unit}`, added, !calc.snap)}
      {calc.snap && <>{arrow}{chip(`ליום ${calc.snap.day} ${SNAP_LABEL[calc.snap.mode].split(",")[0]}`, final, true)}</>}
    </div>
  );
}

/**
 * "תוקף הקישור": [the default | a rule | no expiry]. A rule reads as a sentence ("הקישור נסגר 7 ימים אחרי תחילת
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
  const mode: "inherit" | "none" | "rule" = !value ? "inherit" : value.kind === "none" ? "none" : "rule";
  const fresh = (): ExpiryCalc => ({ kind: "calc", base: { from: bases[0]! } as ExpiryBase, addDays: bases[0] === "stepStart" ? 7 : 30 });
  const cases: ExpiryCase[] = value?.kind === "cases" ? value.cases : [];
  const otherwise: ExpiryOutcome | null = value?.kind === "cases" ? value.otherwise : value?.kind === "calc" ? value : null;
  const usable = usableOf(dateFields);
  const setCases = (next: ExpiryCase[], other: ExpiryOutcome = otherwise ?? fresh()) => onChange(next.length ? { kind: "cases", cases: next, otherwise: other } : other);
  const addCase = () => setCases([...cases, { when: { type: "day", fieldId: usable[0]?.id ?? "", op: "lte", day: 20 }, then: otherwise?.kind === "calc" ? otherwise : fresh() }]);
  const fieldName = (fid: string) => dateFields.find((f) => f.id === fid)?.label ?? "שדה שלא זמין כאן";

  // Example dates: the moment the link is set ("today"), and each date field the rule reads.
  const used = value ? expiryRuleFields(value) : [];
  const [startDay, setStartDay] = useState(() => ymd(new Date()));
  const [examples, setExamples] = useState<Record<string, string>>({});
  const answers: Record<string, string> = Object.fromEntries(used.map((f) => [f, examples[f] ?? startDay]));
  const start = noonOf(startDay);
  const chosen = cases.findIndex((c) => holds(c.when, answers, start));
  const outcome = chosen >= 0 ? cases[chosen]!.then : otherwise;

  const modes: { id: typeof mode; label: string }[] = [
    ...(inherit ? [{ id: "inherit" as const, label: "ברירת מחדל" }] : []),
    { id: "rule", label: "לפי כלל" },
    { id: "none", label: "ללא תוקף" },
  ];

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">תוקף הקישור</legend>
        <div role="radiogroup" className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => onChange(m.id === "inherit" ? undefined : m.id === "none" ? { kind: "none" } : (value && value.kind !== "none" ? value : fresh()))}
              className={cn("min-h-10 rounded-md px-3 text-sm font-medium", mode === m.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "inherit" && inherit && <p className="mt-2 text-sm text-muted-foreground">{inherit}</p>}
        {mode === "none" && <p className="mt-2 text-sm text-muted-foreground">הקישור לא פג.</p>}
      </fieldset>

      {mode === "rule" && value && otherwise && (
        <div className="space-y-3">
          {cases.map((c, k) => (
            <section key={k} aria-label={`תנאי ${k + 1}`} className={cn("space-y-3 rounded-lg border p-3", chosen === k && "border-primary")}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <ConditionEditor id={`${id}-c${k}`} value={c.when} onChange={(when) => setCases(cases.map((x, j) => (j === k ? { ...x, when } : x)))} dateFields={dateFields} />
                </div>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => setCases(cases.filter((_, j) => j !== k))} aria-label={`מחיקת תנאי ${k + 1}`}><Trash2 className="size-4" aria-hidden /></Button>
              </div>
              <OutcomeEditor id={`${id}-t${k}`} value={c.then} onChange={(then) => setCases(cases.map((x, j) => (j === k ? { ...x, then } : x)))} dateFields={dateFields} bases={bases} fresh={fresh} />
            </section>
          ))}

          <section aria-label={cases.length ? "בכל מקרה אחר" : "הכלל"} className={cn("space-y-3 rounded-lg border p-3", cases.length > 0 && chosen < 0 && "border-primary")}>
            {cases.length > 0 && <p className="text-sm font-semibold">בכל מקרה אחר</p>}
            {cases.length > 0
              ? <OutcomeEditor id={`${id}-else`} value={otherwise} onChange={(o) => setCases(cases, o)} dateFields={dateFields} bases={bases} fresh={fresh} />
              : otherwise.kind === "calc" && <RuleSentence id={`${id}-else`} value={otherwise} onChange={onChange} dateFields={dateFields} bases={bases} />}
          </section>

          <div>
            <Button type="button" variant="ghost" size="sm" className="text-primary" disabled={usable.length === 0 || cases.length >= MAX_CASES} onClick={addCase}>
              <Plus className="size-4" aria-hidden />{cases.length ? "עוד תנאי" : "כלל אחר במקרים מסוימים (אם…)"}
            </Button>
            {usable.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {dateFields.length === 0 ? "תנאי בודק תאריך מהטופס – אין בטופס שדה תאריך." : "תנאי בודק תאריך שכבר מולא כשהשלב מתחיל – שייכו שדה תאריך לשלב קודם."}
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-lg bg-muted/50 p-3" aria-live="polite">
            <p className="flex items-center gap-2 text-sm font-medium"><CalendarClock className="size-4 shrink-0 text-primary" aria-hidden />איך זה מחושב – דוגמה</p>
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
            {cases.length > 0 && <p className="text-sm text-muted-foreground">חל: <strong className="text-foreground">{chosen >= 0 ? `תנאי ${chosen + 1}` : "בכל מקרה אחר"}</strong></p>}
            {outcome?.kind === "calc"
              ? <Trail calc={outcome} answers={answers} start={start} fieldName={fieldName} />
              : <p className="text-sm font-medium">הקישור לא פג.</p>}
            <p className="text-xs text-muted-foreground">בקיצור: {describeExpiryRule(value, fieldName)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** For a server form: the builder plus a hidden input with the rule as JSON (empty = the default). */
export function ExpiryRuleField({ name, initial, dateFields, inherit }: { name: string; initial: ExpiryRule | null; dateFields: DateFieldOption[]; inherit: string }) {
  const [rule, setRule] = useState<ExpiryRule | undefined>(initial ?? undefined);
  return (
    <>
      <ExpiryRuleBuilder id={name} value={rule} onChange={setRule} dateFields={dateFields} bases={["sent"]} inherit={inherit} />
      <input type="hidden" name={name} value={rule ? JSON.stringify(rule) : ""} />
    </>
  );
}
