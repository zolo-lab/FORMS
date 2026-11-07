"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { describeExpiryRule, expiryFor, type ExpiryBase, type ExpiryRule, type ExpirySnap } from "@/lib/requests/expiry";

/** A date field of the form; `hint` says who fills it ("שלב 2 · העובד"). */
export type DateFieldOption = { id: string; label: string; hint?: string };
type BaseKind = "sent" | "stepStart";
type Calc = Extract<ExpiryRule, { kind: "calc" }>;

const BASE_LABEL: Record<BaseKind, string> = { sent: "שליחת הבקשה", stepStart: "תחילת השלב" };
const SNAP_LABEL: Record<"" | ExpirySnap["mode"], string> = {
  "": "בלי עיגול – בדיוק בתאריך שיצא",
  same: "ליום מסוים באותו חודש",
  sameOrNext: "ליום מסוים: באותו חודש, ואם כבר עבר – בחודש הבא",
  next: "ליום מסוים בחודש הבא",
};
const fmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });

/** Ready-made rules, Make's among them; the ones counted from a date use the chosen (or first) date field. */
const PRESETS: { id: string; label: (f: string) => string; make: (fieldId: string) => Calc; field?: boolean; base?: BaseKind }[] = [
  { id: "sent30", label: () => "30 ימים מהשליחה", make: () => ({ kind: "calc", base: { from: "sent" }, addDays: 30 }), base: "sent" },
  { id: "start7", label: () => "7 ימים מתחילת השלב", make: () => ({ kind: "calc", base: { from: "stepStart" }, addDays: 7 }), base: "stepStart" },
  { id: "next7", label: (f) => `ה-7 בחודש שאחרי ${f}`, make: (id) => ({ kind: "calc", base: { from: "field", fieldId: id }, snap: { day: 7, mode: "next" } }), field: true },
  { id: "next10", label: (f) => `ה-10 בחודש שאחרי ${f}`, make: (id) => ({ kind: "calc", base: { from: "field", fieldId: id }, snap: { day: 10, mode: "next" } }), field: true },
  { id: "same20", label: (f) => `ה-20 לפי ${f} (אותו חודש או הבא)`, make: (id) => ({ kind: "calc", base: { from: "field", fieldId: id }, snap: { day: 20, mode: "sameOrNext" } }), field: true },
  { id: "field20", label: (f) => `20 יום אחרי ${f}`, make: (id) => ({ kind: "calc", base: { from: "field", fieldId: id }, addDays: 20 }), field: true },
  { id: "field1m", label: (f) => `חודש אחרי ${f}`, make: (id) => ({ kind: "calc", base: { from: "field", fieldId: id }, addMonths: 1 }), field: true },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * "תוקף הקישור" as a sentence: [no expiry | the default | a date worked out]; for a worked-out date: start from
 * [sending | the step's start | any date field of the form], add [days, months], and round to [a day of the month:
 * this month / this month or the next / the next]. Ready-made rules on top (Make's: the 7th / 10th of the month after
 * the start date, the 20th this month or the next), and a live example of the result.
 * `inherit`: the label of "follow the default" (missing = not offered).
 */
export function ExpiryRuleBuilder({ id, value, onChange, dateFields, bases, inherit }: {
  id: string;
  value: ExpiryRule | undefined;
  onChange: (rule: ExpiryRule | undefined) => void;
  dateFields: DateFieldOption[];
  bases: BaseKind[];
  inherit?: string;
}) {
  const calc = value?.kind === "calc" ? value : null;
  const mode: "inherit" | "none" | "calc" = !value ? "inherit" : value.kind === "none" ? "none" : "calc";
  const fieldId = calc?.base.from === "field" ? calc.base.fieldId : (dateFields[0]?.id ?? "");
  const fieldName = (fid: string) => dateFields.find((f) => f.id === fid)?.label ?? "שדה שכבר לא קיים";
  const set = (patch: Partial<Calc>) => {
    const next: Calc = { ...(calc ?? { kind: "calc", base: { from: bases[0]! } as ExpiryBase }), ...patch };
    if (!next.addDays) delete next.addDays;
    if (!next.addMonths) delete next.addMonths;
    if (!next.snap) delete next.snap;
    onChange(next);
  };
  const baseValue = calc ? (calc.base.from === "field" ? `field:${calc.base.fieldId}` : calc.base.from) : bases[0]!;
  const [example, setExample] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date()));
  const baseField = calc?.base.from === "field" ? calc.base.fieldId : null;
  const fromField = baseField !== null;
  const result = calc && baseField !== "" ? expiryFor(calc, baseField ? { [baseField]: example } : {}, new Date()) : null;

  const modes: { id: typeof mode; label: string }[] = [
    ...(inherit ? [{ id: "inherit" as const, label: "ברירת מחדל" }] : []),
    { id: "calc", label: "תאריך מחושב" },
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
              onClick={() => onChange(m.id === "inherit" ? undefined : m.id === "none" ? { kind: "none" } : (calc ?? PRESETS.find((p) => p.field && dateFields.length)?.make(fieldId) ?? PRESETS[bases.includes("stepStart") ? 1 : 0]!.make("")))}
              className={cn("min-h-10 rounded-md px-3 text-sm font-medium", mode === m.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "inherit" && inherit && <p className="mt-2 text-sm text-muted-foreground">{inherit}</p>}
        {mode === "none" && <p className="mt-2 text-sm text-muted-foreground">הקישור לא פג.</p>}
      </fieldset>

      {calc && (
        <>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">בחירה מהירה</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.filter((p) => !p.base || bases.includes(p.base)).map((p) => {
                const rule = p.make(fieldId);
                const disabled = !!p.field && !fieldId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={disabled}
                    title={disabled ? "אין בטופס שדה תאריך" : undefined}
                    aria-pressed={same(rule, calc)}
                    onClick={() => onChange(rule)}
                    className={cn("min-h-9 rounded-full border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50", same(rule, calc) ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}
                  >
                    {p.label(p.field ? `"${fieldName(fieldId)}"` : "")}
                  </button>
                );
              })}
            </div>
            {dateFields.length === 0 && <p className="text-xs text-muted-foreground">כללים לפי תאריך (כמו ה-7 בחודש שאחרי תאריך התחילה) זמינים כשיש בטופס שדה מסוג תאריך.</p>}
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">או בנו כלל משלכם</p>
            <div className="grid gap-x-3 gap-y-2 sm:grid-cols-[6.5rem_1fr] sm:items-center">
              <Label htmlFor={`${id}-base`}>מתחילים מ־</Label>
              <Select id={`${id}-base`} value={baseValue} onChange={(e) => {
                const v = e.target.value;
                set({ base: v.startsWith("field:") ? { from: "field", fieldId: v.slice(6) } : { from: v as BaseKind } });
              }}>
                {bases.map((b) => <option key={b} value={b}>{BASE_LABEL[b]}</option>)}
                {dateFields.length > 0 && (
                  <optgroup label="תאריך מהטופס">
                    {dateFields.map((f) => <option key={f.id} value={`field:${f.id}`}>{f.label}{f.hint ? ` · ${f.hint}` : ""}</option>)}
                  </optgroup>
                )}
                {fromField && !dateFields.some((f) => f.id === fieldId) && <option value={baseValue}>שדה שכבר לא קיים</option>}
              </Select>

              <span className="text-sm font-medium">מוסיפים</span>
              <div className="flex flex-wrap items-center gap-2">
                <Input id={`${id}-days`} aria-label="ימים" type="number" min={0} max={3650} inputMode="numeric" className="w-24" value={calc.addDays ?? 0} onChange={(e) => set({ addDays: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                <span className="text-sm">ימים ו־</span>
                <Input id={`${id}-months`} aria-label="חודשים" type="number" min={0} max={120} inputMode="numeric" className="w-24" value={calc.addMonths ?? 0} onChange={(e) => set({ addMonths: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                <span className="text-sm">חודשים</span>
              </div>

              <Label htmlFor={`${id}-snap`}>ואז מעגלים</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select id={`${id}-snap`} className="min-w-0 flex-1" value={calc.snap?.mode ?? ""} onChange={(e) => {
                  const m = e.target.value as "" | ExpirySnap["mode"];
                  set({ snap: m ? { day: calc.snap?.day ?? (m === "next" ? 7 : 20), mode: m } : undefined });
                }}>
                  {(Object.keys(SNAP_LABEL) as ("" | ExpirySnap["mode"])[]).map((k) => <option key={k} value={k}>{SNAP_LABEL[k]}</option>)}
                </Select>
                {calc.snap && (
                  <span className="flex items-center gap-2">
                    <Label htmlFor={`${id}-day`} className="text-sm">ה־</Label>
                    <Input id={`${id}-day`} type="number" min={1} max={31} inputMode="numeric" className="w-20" value={calc.snap.day} onChange={(e) => set({ snap: { ...calc.snap!, day: Math.min(31, Math.max(1, Math.round(Number(e.target.value)) || 1)) } })} />
                    <span className="text-sm">בחודש</span>
                  </span>
                )}
              </div>
            </div>
            {calc.snap?.day === 31 && <p className="text-xs text-muted-foreground">31 = היום האחרון בחודש (28/29/30 בחודשים קצרים).</p>}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-primary/5 p-3 text-sm" aria-live="polite">
            <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="font-medium">{describeExpiryRule(calc, fieldName)}</span>
            {fromField ? (
              <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <Label htmlFor={`${id}-example`} className="font-normal">לדוגמה, אם {fieldName(fieldId)} =</Label>
                <Input id={`${id}-example`} type="date" value={example} onChange={(e) => setExample(e.target.value)} className="h-9 w-40" />
              </span>
            ) : (
              <span className="text-muted-foreground">לדוגמה, אם {calc.base.from === "sent" ? "נשלח" : "השלב התחיל"} היום</span>
            )}
            {result && <span>← הקישור נסגר ב-<strong>{fmt.format(result)}</strong></span>}
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
