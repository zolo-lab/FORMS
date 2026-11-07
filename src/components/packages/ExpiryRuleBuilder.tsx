"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DEFAULT_EXPIRY_DAYS, describeExpiryRule, expiryFor, type ExpiryBase, type ExpiryRule, type ExpirySnap } from "@/lib/requests/expiry";

/** A date field of the form; `hint` says who fills it ("שלב 2 · העובד"). */
export type DateFieldOption = { id: string; label: string; hint?: string; roles?: string[] };
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

/** One building block of the rule: a numbered step with its title. */
function Block({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-lg border p-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold" aria-hidden>{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

/**
 * "תוקף הקישור" as a sentence: [no expiry | the default | a date worked out]; for a worked-out date: start from
 * [sending | the step's start | any date field of the form], add [days, months], and round to [a day of the month:
 * this month / this month or the next / the next] – three blocks the admin builds the rule from (Make's rules, such as
 * "the 7th of the month after the start date", are built this way), and a live example of the result.
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
  const fieldName = (fid: string) => dateFields.find((f) => f.id === fid)?.label ?? "שדה שלא זמין כאן";
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
              onClick={() => onChange(m.id === "inherit" ? undefined : m.id === "none" ? { kind: "none" } : (calc ?? { kind: "calc", base: { from: bases[0]! } as ExpiryBase, addDays: bases[0] === "stepStart" ? 7 : 30 }))}
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
          <ol className="space-y-3">
            <Block n={1} title="מאיזה תאריך סופרים">
              <Select id={`${id}-base`} aria-label="מאיזה תאריך סופרים" value={baseValue} onChange={(e) => {
                const v = e.target.value;
                set({ base: v.startsWith("field:") ? { from: "field", fieldId: v.slice(6) } : { from: v as BaseKind } });
              }}>
                {bases.map((b) => <option key={b} value={b}>{BASE_LABEL[b]}</option>)}
                {dateFields.length > 0 && (
                  <optgroup label="שדה תאריך מהטופס">
                    {dateFields.map((f) => <option key={f.id} value={`field:${f.id}`}>{f.label}{f.hint ? ` · ${f.hint}` : ""}</option>)}
                  </optgroup>
                )}
                {fromField && !dateFields.some((f) => f.id === fieldId) && <option value={baseValue}>שדה שלא זמין כאן</option>}
              </Select>
              {dateFields.length === 0 && <p className="text-xs text-muted-foreground">כדי לספור מתאריך בטופס (למשל תאריך תחילת עבודה) צריך שדה מסוג תאריך שממולא לפני השלב הזה.</p>}
              {fromField && !dateFields.some((f) => f.id === baseField) && (
                <p role="alert" className="text-sm text-destructive">שדה התאריך שנבחר לא זמין כאן (נמחק, או שממלאים אותו מאוחר יותר). בחרו תאריך אחר – כשאין בו תאריך תקין בזמן החישוב, נספרים {calc.fallbackDays ?? DEFAULT_EXPIRY_DAYS} ימים.</p>
              )}
            </Block>

            <Block n={2} title="כמה זמן מוסיפים">
              <div className="flex flex-wrap items-center gap-2">
                <Input id={`${id}-days`} aria-label="ימים" type="number" min={0} max={3650} inputMode="numeric" className="w-20" value={calc.addDays ?? 0} onChange={(e) => set({ addDays: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                <span className="text-sm">ימים</span>
                <span className="text-sm text-muted-foreground">+</span>
                <Input id={`${id}-months`} aria-label="חודשים" type="number" min={0} max={120} inputMode="numeric" className="w-20" value={calc.addMonths ?? 0} onChange={(e) => set({ addMonths: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                <span className="text-sm">חודשים</span>
              </div>
              <p className="text-xs text-muted-foreground">0 ו-0 = בדיוק בתאריך עצמו (שימושי עם עיגול ליום בחודש).</p>
            </Block>

            <Block n={3} title="עיגול ליום קבוע בחודש">
              <div className="flex flex-wrap items-center gap-2">
                <Select id={`${id}-snap`} aria-label="עיגול ליום קבוע בחודש" className="min-w-0 flex-1" value={calc.snap?.mode ?? ""} onChange={(e) => {
                  const m = e.target.value as "" | ExpirySnap["mode"];
                  set({ snap: m ? { day: calc.snap?.day ?? (m === "next" ? 7 : 20), mode: m } : undefined });
                }}>
                  {(Object.keys(SNAP_LABEL) as ("" | ExpirySnap["mode"])[]).map((k) => <option key={k} value={k}>{SNAP_LABEL[k]}</option>)}
                </Select>
                {calc.snap && (
                  <span className="flex items-center gap-2">
                    <Label htmlFor={`${id}-day`} className="text-sm">היום ה־</Label>
                    <Input id={`${id}-day`} type="number" min={1} max={31} inputMode="numeric" className="w-20" value={calc.snap.day} onChange={(e) => set({ snap: { ...calc.snap!, day: Math.min(31, Math.max(1, Math.round(Number(e.target.value)) || 1)) } })} />
                    <span className="text-sm">בחודש</span>
                  </span>
                )}
              </div>
              {calc.snap?.day === 31 && <p className="text-xs text-muted-foreground">31 = היום האחרון בחודש (28/29/30 בחודשים קצרים).</p>}
            </Block>
          </ol>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-primary/5 p-3 text-sm" aria-live="polite">
            <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="font-medium">הכלל: {describeExpiryRule(calc, fieldName)}</span>
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
