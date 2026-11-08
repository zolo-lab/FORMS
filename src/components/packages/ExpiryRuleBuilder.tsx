"use client";

import { useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_EXPIRY_DAYS, describeExpiryRule, expiryFor, expiryRuleFields,
  type ExpiryBase, type ExpiryCalc, type ExpiryCase, type ExpiryCondition, type ExpiryOutcome, type ExpiryRule, type ExpirySnap,
} from "@/lib/requests/expiry";

/** A date field of the form; `hint` says who fills it ("שלב 2 · העובד"). */
/** `unavailable`: why the field cannot be used here (filled only later) – listed, but not chosen. */
export type DateFieldOption = { id: string; label: string; hint?: string; roles?: string[]; unavailable?: string };
const usableOf = (fields: DateFieldOption[]) => fields.filter((f) => !f.unavailable);
type BaseKind = "sent" | "stepStart";

const BASE_LABEL: Record<BaseKind, string> = { sent: "שליחת הבקשה", stepStart: "תחילת השלב" };
const SNAP_LABEL: Record<"" | ExpirySnap["mode"], string> = {
  "": "לא – התאריך שיצא",
  same: "כן – יום מסוים באותו חודש",
  next: "כן – יום מסוים בחודש שאחריו",
  sameOrNext: "כן – יום מסוים באותו חודש, ואם הוא כבר עבר – בחודש שאחריו",
};
/** What the chosen fixed day does, on a sample date (the 12th of March). */
function snapExample(snap: ExpirySnap): string {
  const d = String(snap.day).padStart(2, "0");
  const next = snap.mode === "next" || (snap.mode === "sameOrNext" && snap.day < 12);
  return `למשל, אם יצא 12.03 – הקישור נסגר ב-${d}.${next ? "04" : "03"}.`;
}
type CondKey = "day-lte" | "day-gt" | "today-past" | "today-within" | "today-beyond";
const COND_LABEL: Record<CondKey, string> = {
  "day-lte": "היום בחודש שלו הוא עד",
  "day-gt": "היום בחודש שלו הוא אחרי",
  "today-past": "כבר עבר (לפני היום)",
  "today-within": "בתוך מספר ימים מהיום",
  "today-beyond": "בעוד יותר ממספר ימים מהיום",
};
const condKey = (c: ExpiryCondition): CondKey => `${c.type}-${c.op}` as CondKey;
const MAX_CASES = 10;
const fmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });
const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v)) || 0));

/** A building block: a numbered step with its title. */
function Block({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold" aria-hidden>{n}</span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** A date worked out: count from [a moment / a date field], add [days, months], round to [a day of the month]. */
function CalcEditor({ id, value, onChange, dateFields, bases }: { id: string; value: ExpiryCalc; onChange: (v: ExpiryCalc) => void; dateFields: DateFieldOption[]; bases: BaseKind[] }) {
  const set = (patch: Partial<ExpiryCalc>) => {
    const next: ExpiryCalc = { ...value, ...patch };
    if (!next.addDays) delete next.addDays;
    if (!next.addMonths) delete next.addMonths;
    if (!next.snap) delete next.snap;
    onChange(next);
  };
  const fieldId = value.base.from === "field" ? value.base.fieldId : null;
  const baseValue = fieldId !== null ? `field:${fieldId}` : value.base.from;
  return (
    <ol className="space-y-3">
      <Block n={1} title="מאיזה תאריך סופרים">
        <Select id={`${id}-base`} aria-label="מאיזה תאריך סופרים" value={baseValue} onChange={(e) => {
          const v = e.target.value;
          set({ base: v.startsWith("field:") ? { from: "field", fieldId: v.slice(6) } : { from: v as BaseKind } });
        }}>
          {bases.map((b) => <option key={b} value={b}>{BASE_LABEL[b]}</option>)}
          {dateFields.length > 0 && (
            <optgroup label="שדה תאריך מהטופס">
              {dateFields.map((f) => <option key={f.id} value={`field:${f.id}`} disabled={!!f.unavailable}>{f.label}{f.unavailable ? ` – ${f.unavailable}` : f.hint ? ` · ${f.hint}` : ""}</option>)}
            </optgroup>
          )}
          {fieldId !== null && !dateFields.some((f) => f.id === fieldId) && <option value={baseValue}>שדה שלא זמין כאן</option>}
        </Select>
        {fieldId !== null && !usableOf(dateFields).some((f) => f.id === fieldId) && (
          <p role="alert" className="text-sm text-destructive">שדה התאריך שנבחר לא זמין כאן (נמחק, או שממלאים אותו מאוחר יותר). בחרו תאריך אחר – כשאין בו תאריך תקין בזמן החישוב, נספרים {value.fallbackDays ?? DEFAULT_EXPIRY_DAYS} ימים.</p>
        )}
      </Block>
      <Block n={2} title="כמה זמן מוסיפים">
        <div className="flex flex-wrap items-center gap-2">
          <Input id={`${id}-days`} aria-label="ימים" type="number" min={0} max={3650} inputMode="numeric" className="w-20" value={value.addDays ?? 0} onChange={(e) => set({ addDays: num(e.target.value, 0, 3650) })} />
          <span className="text-sm">ימים</span>
          <span className="text-sm text-muted-foreground">+</span>
          <Input id={`${id}-months`} aria-label="חודשים" type="number" min={0} max={120} inputMode="numeric" className="w-20" value={value.addMonths ?? 0} onChange={(e) => set({ addMonths: num(e.target.value, 0, 120) })} />
          <span className="text-sm">חודשים</span>
        </div>
      </Block>
      <Block n={3} title="להעביר ליום קבוע בחודש? (לא חובה)">
        <div className="flex flex-wrap items-center gap-2">
          <Select id={`${id}-snap`} aria-label="להעביר ליום קבוע בחודש" className="min-w-0 flex-1" value={value.snap?.mode ?? ""} onChange={(e) => {
            const m = e.target.value as "" | ExpirySnap["mode"];
            set({ snap: m ? { day: value.snap?.day ?? (m === "next" ? 7 : 20), mode: m } : undefined });
          }}>
            {(Object.keys(SNAP_LABEL) as ("" | ExpirySnap["mode"])[]).map((k) => <option key={k} value={k}>{SNAP_LABEL[k]}</option>)}
          </Select>
          {value.snap && (
            <span className="flex items-center gap-2">
              <Label htmlFor={`${id}-day`} className="text-sm">היום ה־</Label>
              <Input id={`${id}-day`} type="number" min={1} max={31} inputMode="numeric" className="w-20" value={value.snap.day} onChange={(e) => set({ snap: { ...value.snap!, day: num(e.target.value, 1, 31) } })} />
              <span className="text-sm">בחודש</span>
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {value.snap ? snapExample(value.snap) : "למשל כש-Make סוגר תמיד ב-7 לחודש: בוחרים \"כן – יום מסוים בחודש שאחריו\" ויום 7."}
          {value.snap?.day === 31 && " 31 = היום האחרון בחודש (28/29/30 בחודשים קצרים)."}
        </p>
      </Block>
    </ol>
  );
}

/** What a condition (or "otherwise") leads to: a date worked out, or no expiry. */
function OutcomeEditor({ id, value, onChange, dateFields, bases, fresh }: { id: string; value: ExpiryOutcome; onChange: (v: ExpiryOutcome) => void; dateFields: DateFieldOption[]; bases: BaseKind[]; fresh: () => ExpiryCalc }) {
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="התוצאה" className="inline-flex gap-1 rounded-lg border bg-muted/40 p-1">
        {(["calc", "none"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={value.kind === k} onClick={() => onChange(k === "none" ? { kind: "none" } : value.kind === "calc" ? value : fresh())}
            className={cn("min-h-9 rounded-md px-3 text-sm font-medium", value.kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {k === "calc" ? "תאריך מחושב" : "ללא תוקף"}
          </button>
        ))}
      </div>
      {value.kind === "calc" && <CalcEditor id={id} value={value} onChange={onChange} dateFields={dateFields} bases={bases} />}
    </div>
  );
}

/** "If [a date field] [is …]": the day of its month against a number, or the date against today. */
function ConditionEditor({ id, value, onChange, dateFields }: { id: string; value: ExpiryCondition; onChange: (v: ExpiryCondition) => void; dateFields: DateFieldOption[] }) {
  const setKey = (k: CondKey) => {
    const [type, op] = k.split("-") as [ExpiryCondition["type"], string];
    onChange(type === "day"
      ? { type: "day", fieldId: value.fieldId, op: op as "lte" | "gt", day: value.type === "day" ? value.day : 20 }
      : op === "past" ? { type: "today", fieldId: value.fieldId, op: "past" } : { type: "today", fieldId: value.fieldId, op: op as "within" | "beyond", days: value.type === "today" ? (value.days ?? 7) : 7 });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold">אם</span>
      <Select id={`${id}-field`} aria-label="שדה התאריך בתנאי" className="w-auto min-w-0 flex-1" value={value.fieldId} onChange={(e) => onChange({ ...value, fieldId: e.target.value })}>
        {!dateFields.some((f) => f.id === value.fieldId) && <option value={value.fieldId}>{value.fieldId ? "שדה שלא זמין כאן" : "בחרו שדה תאריך…"}</option>}
        {dateFields.map((f) => <option key={f.id} value={f.id} disabled={!!f.unavailable}>{f.label}{f.unavailable ? ` – ${f.unavailable}` : ""}</option>)}
      </Select>
      <Select id={`${id}-op`} aria-label="התנאי" className="w-auto min-w-0 flex-1" value={condKey(value)} onChange={(e) => setKey(e.target.value as CondKey)}>
        {(Object.keys(COND_LABEL) as CondKey[]).map((k) => <option key={k} value={k}>{COND_LABEL[k]}</option>)}
      </Select>
      {value.type === "day" && (
        <Input id={`${id}-n`} aria-label="יום בחודש" type="number" min={1} max={31} inputMode="numeric" className="w-20" value={value.day} onChange={(e) => onChange({ ...value, day: num(e.target.value, 1, 31) })} />
      )}
      {value.type === "today" && value.op !== "past" && (
        <span className="flex items-center gap-2">
          <Input id={`${id}-n`} aria-label="מספר ימים" type="number" min={0} max={3650} inputMode="numeric" className="w-20" value={value.days ?? 0} onChange={(e) => onChange({ ...value, days: num(e.target.value, 0, 3650) })} />
          <span className="text-sm">ימים</span>
        </span>
      )}
    </div>
  );
}

/**
 * "תוקף הקישור" built from blocks: [the default | a rule | no expiry]. A rule is a date worked out (count from a moment
 * or a date field, add days and months, round to a day of the month), and may be split by conditions – "if the start
 * date's day is up to the 20th → …, if the date already passed → …, otherwise → …" – so Make's rules are built here.
 * A live example shows the result for dates the admin types. `inherit`: the label of "follow the default".
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
  const setCases = (next: ExpiryCase[], other: ExpiryOutcome = otherwise ?? fresh()) => {
    if (next.length) onChange({ kind: "cases", cases: next, otherwise: other });
    else onChange(other);
  };
  const addCase = () => setCases([...cases, {
    when: { type: "day", fieldId: usable[0]?.id ?? "", op: "lte", day: 20 },
    then: otherwise && otherwise.kind === "calc" ? otherwise : fresh(),
  }]);
  const usable = usableOf(dateFields);
  const fieldName = (fid: string) => dateFields.find((f) => f.id === fid)?.label ?? "שדה שלא זמין כאן";

  // The example: one date per field the rule reads.
  const used = value ? expiryRuleFields(value) : [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const [examples, setExamples] = useState<Record<string, string>>({});
  const answers: Record<string, string> = Object.fromEntries(used.map((f) => [f, examples[f] ?? today]));
  const result = value && mode === "rule" ? expiryFor(value, answers, new Date()) : null;

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
        <>
          {cases.map((c, k) => (
            <section key={k} aria-label={`תנאי ${k + 1}`} className="space-y-3 rounded-lg border border-primary/30 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <ConditionEditor id={`${id}-c${k}`} value={c.when} onChange={(when) => setCases(cases.map((x, j) => (j === k ? { ...x, when } : x)))} dateFields={dateFields} />
                </div>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => setCases(cases.filter((_, j) => j !== k))} aria-label={`מחיקת תנאי ${k + 1}`}><Trash2 className="size-4" aria-hidden /></Button>
              </div>
              <p className="text-sm font-semibold">אז:</p>
              <OutcomeEditor id={`${id}-t${k}`} value={c.then} onChange={(then) => setCases(cases.map((x, j) => (j === k ? { ...x, then } : x)))} dateFields={dateFields} bases={bases} fresh={fresh} />
            </section>
          ))}

          <section aria-label={cases.length ? "בכל מקרה אחר" : "הכלל"} className={cn("space-y-3 rounded-lg border p-3", cases.length > 0 && "bg-muted/20")}>
            {cases.length > 0 && <p className="text-sm font-semibold">בכל מקרה אחר:</p>}
            {cases.length > 0
              ? <OutcomeEditor id={`${id}-else`} value={otherwise} onChange={(o) => setCases(cases, o)} dateFields={dateFields} bases={bases} fresh={fresh} />
              : otherwise.kind === "calc" && <CalcEditor id={`${id}-else`} value={otherwise} onChange={onChange} dateFields={dateFields} bases={bases} />}
          </section>

          <div className="space-y-1">
            <Button type="button" variant="outline" size="sm" disabled={usable.length === 0 || cases.length >= MAX_CASES} onClick={addCase}><Plus className="size-4" aria-hidden />הוספת תנאי (אם…)</Button>
            <p className="text-xs text-muted-foreground">
              {cases.length >= MAX_CASES
                ? `אפשר עד ${MAX_CASES} תנאים.`
                : dateFields.length === 0
                  ? "תנאי בודק שדה מסוג תאריך – אין כזה בטופס."
                  : usable.length === 0
                    ? `אי אפשר להשתמש ב${dateFields.map((f) => `"${f.label}" (${f.unavailable})`).join(", ")}: הקישור נקבע כשהשלב מתחיל, ולכן התאריך צריך להיות ממולא בשלב קודם. שייכו את השדה לשלב קודם בלשונית השדות.`
                    : "למשל: אם היום בחודש של תאריך התחילה עד 20 → ה-20 באותו חודש; אם התאריך כבר עבר → 7 ימים מתחילת השלב. התנאי הראשון שמתקיים קובע."}
            </p>
          </div>

          <div className="space-y-2 rounded-lg bg-primary/5 p-3 text-sm" aria-live="polite">
            <p className="flex gap-2 font-medium"><CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{describeExpiryRule(value, fieldName)}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground">
              <span>לדוגמה{used.length ? "," : " אם הקישור נוצר היום"}</span>
              {used.map((f) => (
                <span key={f} className="flex items-center gap-2">
                  <Label htmlFor={`${id}-ex-${f}`} className="font-normal">{fieldName(f)} =</Label>
                  <Input id={`${id}-ex-${f}`} type="date" value={answers[f]} onChange={(e) => setExamples({ ...examples, [f]: e.target.value })} className="h-9 w-40" />
                </span>
              ))}
              <span>{result ? <>← הקישור נסגר ב-<strong className="text-foreground">{fmt.format(result)}</strong></> : "← ללא תוקף"}</span>
            </div>
          </div>
        </>
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
