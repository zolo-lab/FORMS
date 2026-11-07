"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeExpiryRule, expiryFor, type ExpiryBase, type ExpiryRule } from "@/lib/requests/expiry";

type Option = { id: string; label: string };
type BaseKind = "sent" | "stepStart" | "field";
type SnapKind = "" | "sameOrNext" | "next";

const BASE_LABEL: Record<BaseKind, string> = { sent: "שליחת הבקשה", stepStart: "תחילת השלב", field: "תאריך משדה בטופס" };
const fmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });

type Preset = { id: string; label: string; make: (field: string) => ExpiryRule | undefined; needsField?: boolean; bases?: BaseKind[] };
const PRESETS: Preset[] = [
  { id: "none", label: "ללא תוקף", make: () => ({ kind: "none" }) },
  { id: "sent30", label: "30 ימים מהשליחה", make: () => ({ kind: "calc", base: { from: "sent" }, addDays: 30 }), bases: ["sent"] },
  { id: "start7", label: "7 ימים מתחילת השלב", make: () => ({ kind: "calc", base: { from: "stepStart" }, addDays: 7 }), bases: ["stepStart"] },
  { id: "next7", label: "ה-7 בחודש שאחרי תאריך", make: (f) => ({ kind: "calc", base: { from: "field", fieldId: f }, snap: { day: 7, mode: "next" } }), needsField: true },
  { id: "next10", label: "ה-10 בחודש שאחרי תאריך", make: (f) => ({ kind: "calc", base: { from: "field", fieldId: f }, snap: { day: 10, mode: "next" } }), needsField: true },
  { id: "same20", label: "ה-20 בחודש לפי תאריך (אותו חודש או הבא)", make: (f) => ({ kind: "calc", base: { from: "field", fieldId: f }, snap: { day: 20, mode: "sameOrNext" } }), needsField: true },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * "תוקף הקישור" as a sentence: start from [sending / the step's start / a date in the form], add [days, months], round
 * to [a day of the month]. Ready-made choices on top (including Make's: the 7th / 10th of the month after the start
 * date, the 20th this month or the next), the three parts below for anything else, and a live example of the result.
 * `inherit`: the label of "follow the default" (missing = the choice is not offered).
 */
export function ExpiryRuleBuilder({ id, value, onChange, dateFields, bases, inherit }: {
  id: string;
  value: ExpiryRule | undefined;
  onChange: (rule: ExpiryRule | undefined) => void;
  dateFields: Option[];
  bases: BaseKind[];
  inherit?: string;
}) {
  const firstField = dateFields[0]?.id ?? "";
  const presets = PRESETS.filter((p) => (!p.needsField || firstField) && (!p.bases || p.bases.some((b) => bases.includes(b))));
  const match = value ? presets.find((p) => same(p.make(value.kind === "calc" && value.base.from === "field" ? value.base.fieldId : firstField), value)) : undefined;
  const [custom, setCustom] = useState(!!value && value.kind === "calc" && !match);
  const choice = !value ? "inherit" : custom ? "custom" : (match?.id ?? "custom");

  const calc = value?.kind === "calc" ? value : null;
  const baseKind: BaseKind = calc?.base.from ?? bases[0]!;
  const fieldId = calc?.base.from === "field" ? calc.base.fieldId : firstField;
  const snapKind: SnapKind = calc?.snap?.mode ?? "";
  const set = (patch: Partial<Extract<ExpiryRule, { kind: "calc" }>>) => {
    const next = { ...(calc ?? { kind: "calc" as const, base: { from: bases[0]! } as ExpiryBase }), ...patch };
    if (!next.addDays) delete next.addDays;
    if (!next.addMonths) delete next.addMonths;
    if (!next.snap) delete next.snap;
    onChange(next);
  };

  const fieldLabel = (fid: string) => dateFields.find((f) => f.id === fid)?.label ?? "שדה שכבר לא קיים";
  const [example, setExample] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date()));
  const result = value ? expiryFor(value, calc?.base.from === "field" ? { [calc.base.fieldId]: example } : {}, new Date()) : null;
  const needsDate = calc?.base.from === "field" && !calc.base.fieldId;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${id}-preset`}>תוקף הקישור</Label>
        <Select
          id={`${id}-preset`}
          value={choice}
          onChange={(e) => {
            const v = e.target.value;
            setCustom(v === "custom");
            if (v === "inherit") onChange(undefined);
            else if (v === "custom") onChange(calc ?? { kind: "calc", base: bases.includes("field") && firstField ? { from: "field", fieldId: firstField } : { from: bases[0]! } as ExpiryBase, ...(bases.includes("field") && firstField ? { snap: { day: 7, mode: "next" as const } } : { addDays: 30 }) });
            else onChange(presets.find((p) => p.id === v)!.make(fieldId || firstField));
          }}
        >
          {inherit && <option value="inherit">{inherit}</option>}
          {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          <option value="custom">כלל מותאם…</option>
        </Select>
      </div>

      {calc && (
        <ol className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
          <li className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr] sm:items-end">
            <span className="font-medium">1. מתחילים מ־</span>
            <div className="space-y-1">
              <Label htmlFor={`${id}-base`} className="sr-only">נקודת התחלה</Label>
              <Select id={`${id}-base`} value={baseKind} onChange={(e) => {
                const k = e.target.value as BaseKind;
                set({ base: k === "field" ? { from: "field", fieldId: firstField } : { from: k } });
              }}>
                {bases.map((b) => <option key={b} value={b} disabled={b === "field" && !firstField}>{BASE_LABEL[b]}{b === "field" && !firstField ? " (אין שדה תאריך בטופס)" : ""}</option>)}
              </Select>
            </div>
            {baseKind === "field" && (
              <div className="space-y-1">
                <Label htmlFor={`${id}-field`} className="sr-only">שדה התאריך</Label>
                <Select id={`${id}-field`} value={fieldId} aria-invalid={!fieldId || undefined} onChange={(e) => set({ base: { from: "field", fieldId: e.target.value } })}>
                  <option value="">בחרו שדה תאריך…</option>
                  {fieldId && !dateFields.some((f) => f.id === fieldId) && <option value={fieldId}>שדה שכבר לא קיים</option>}
                  {dateFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </Select>
              </div>
            )}
          </li>
          <li className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr] sm:items-end">
            <span className="font-medium">2. מוסיפים</span>
            <div className="space-y-1">
              <Label htmlFor={`${id}-days`}>ימים</Label>
              <Input id={`${id}-days`} type="number" min={0} max={3650} inputMode="numeric" value={calc.addDays ?? 0} onChange={(e) => set({ addDays: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-months`}>חודשים</Label>
              <Input id={`${id}-months`} type="number" min={0} max={120} inputMode="numeric" value={calc.addMonths ?? 0} onChange={(e) => set({ addMonths: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
            </div>
          </li>
          <li className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr] sm:items-end">
            <span className="font-medium">3. מעגלים ל־</span>
            <div className="space-y-1">
              <Label htmlFor={`${id}-snap`} className="sr-only">עיגול ליום בחודש</Label>
              <Select id={`${id}-snap`} value={snapKind} onChange={(e) => {
                const m = e.target.value as SnapKind;
                set({ snap: m ? { day: calc.snap?.day ?? (m === "sameOrNext" ? 20 : 7), mode: m } : undefined });
              }}>
                <option value="">בלי עיגול</option>
                <option value="sameOrNext">יום בחודש: באותו חודש, ואם עבר – בחודש הבא</option>
                <option value="next">יום בחודש הבא</option>
              </Select>
            </div>
            {calc.snap && (
              <div className="space-y-1">
                <Label htmlFor={`${id}-day`}>היום בחודש</Label>
                <Input id={`${id}-day`} type="number" min={1} max={31} inputMode="numeric" value={calc.snap.day} onChange={(e) => set({ snap: { ...calc.snap!, day: Math.min(31, Math.max(1, Math.round(Number(e.target.value)) || 1)) } })} />
              </div>
            )}
          </li>
        </ol>
      )}

      {value && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-primary/5 p-3 text-sm" aria-live="polite">
          <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="font-medium">{describeExpiryRule(value, fieldLabel)}</span>
          {calc?.base.from === "field" && !needsDate && (
            <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <Label htmlFor={`${id}-example`} className="font-normal">לדוגמה, אם {fieldLabel(fieldId)} הוא</Label>
              <Input id={`${id}-example`} type="date" value={example} onChange={(e) => setExample(e.target.value)} className="h-9 w-40" />
            </span>
          )}
          {calc && calc.base.from !== "field" && <span className="text-muted-foreground">לדוגמה, אם נשלח היום,</span>}
          {result && !needsDate && <span>← הקישור נסגר ב-<strong>{fmt.format(result)}</strong> בסוף היום</span>}
          {needsDate && <span className="text-destructive">בחרו את שדה התאריך</span>}
        </div>
      )}
    </div>
  );
}

/** For a server form: the builder plus a hidden input with the rule as JSON (empty = the default). */
export function ExpiryRuleField({ name, initial, dateFields, inherit }: { name: string; initial: ExpiryRule | null; dateFields: Option[]; inherit: string }) {
  const [rule, setRule] = useState<ExpiryRule | undefined>(initial ?? undefined);
  return (
    <>
      <ExpiryRuleBuilder id={name} value={rule} onChange={setRule} dateFields={dateFields} bases={["sent", "field"]} inherit={inherit} />
      <input type="hidden" name={name} value={rule ? JSON.stringify(rule) : ""} />
    </>
  );
}
