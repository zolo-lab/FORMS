"use client";
import { useState } from "react";
import { Star } from "lucide-react";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { resolveOptions } from "@/lib/forms/lookups";
import { cn } from "@/lib/utils";
import type { FieldProps } from "./types";

const OTHER = "אחר";

export function RadioInput({ field, domId, value, onChange, disabled, lookups }: FieldProps) {
  const options = resolveOptions(field, lookups);
  const current = typeof value === "string" ? value : "";
  const inList = options.some((o) => o.value === current);
  const [otherOn, setOtherOn] = useState(current !== "" && !inList);
  return (
    <div role="radiogroup" id={domId} className="space-y-2">
      {options.map((o) => (
        <label key={o.value} className="flex min-h-10 items-center gap-3">
          <Radio name={domId} checked={current === o.value && !otherOn} disabled={disabled} onChange={() => { setOtherOn(false); onChange(o.value); }} />
          <span>{o.label}</span>
        </label>
      ))}
      {field.allowOther && (
        <div className="flex min-h-10 items-center gap-3">
          <Radio name={domId} aria-label={OTHER} checked={otherOn} disabled={disabled} onChange={() => { setOtherOn(true); onChange(""); }} />
          <span>{OTHER}:</span>
          <Input className="max-w-60" disabled={disabled || !otherOn} value={otherOn ? current : ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      )}
    </div>
  );
}

export function CheckboxesInput({ field, domId, value, onChange, disabled, lookups }: FieldProps) {
  const options = resolveOptions(field, lookups);
  const list = Array.isArray(value) ? (value as string[]) : [];
  const known = new Set(options.map((o) => o.value));
  const otherText = list.find((x) => !known.has(x)) ?? "";
  const [otherOn, setOtherOn] = useState(otherText !== "");
  const toggle = (val: string, on: boolean) => onChange(on ? [...list, val] : list.filter((x) => x !== val));
  return (
    <div id={domId} className="space-y-2">
      {options.map((o) => (
        <label key={o.value} className="flex min-h-10 items-center gap-3">
          <Checkbox checked={list.includes(o.value)} disabled={disabled} onChange={(e) => toggle(o.value, e.target.checked)} />
          <span>{o.label}</span>
        </label>
      ))}
      {field.allowOther && (
        <div className="flex min-h-10 items-center gap-3">
          <Checkbox
            aria-label={OTHER}
            checked={otherOn}
            disabled={disabled}
            onChange={(e) => { setOtherOn(e.target.checked); if (!e.target.checked) onChange(list.filter((x) => known.has(x))); }}
          />
          <span>{OTHER}:</span>
          <Input
            className="max-w-60"
            disabled={disabled || !otherOn}
            value={otherText}
            onChange={(e) => onChange([...list.filter((x) => known.has(x)), ...(e.target.value ? [e.target.value] : [])])}
          />
        </div>
      )}
    </div>
  );
}

export function DropdownInput({ field, domId, value, onChange, disabled, invalid, lookups }: FieldProps) {
  const options = resolveOptions(field, lookups);
  return (
    <Select id={domId} value={typeof value === "string" ? value : ""} disabled={disabled} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)}>
      <option value="">{field.placeholder ?? "בחר…"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </Select>
  );
}

export function YesNoInput({ domId, value, onChange, disabled }: FieldProps) {
  return (
    <div role="radiogroup" id={domId} className="flex gap-6">
      {[["yes", "כן"], ["no", "לא"]].map(([v, l]) => (
        <label key={v} className="flex min-h-10 items-center gap-3">
          <Radio name={domId} checked={value === v} disabled={disabled} onChange={() => onChange(v)} />
          <span>{l}</span>
        </label>
      ))}
    </div>
  );
}

export function LinearScaleInput({ field, domId, value, onChange, disabled }: FieldProps) {
  const min = Number(field.settings?.min ?? 1);
  const max = Number(field.settings?.max ?? 5);
  const nums = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
  return (
    <div id={domId} role="radiogroup" className="space-y-1">
      <div className="flex flex-wrap items-end gap-3">
        {field.settings?.minLabel ? <span className="text-sm text-muted-foreground">{String(field.settings.minLabel)}</span> : null}
        {nums.map((n) => (
          <label key={n} className="flex flex-col items-center gap-1 text-sm">
            <span>{n}</span>
            <Radio name={domId} checked={Number(value) === n && value !== undefined && value !== ""} disabled={disabled} onChange={() => onChange(n)} />
          </label>
        ))}
        {field.settings?.maxLabel ? <span className="text-sm text-muted-foreground">{String(field.settings.maxLabel)}</span> : null}
      </div>
    </div>
  );
}

export function RatingInput({ field, domId, value, onChange, disabled }: FieldProps) {
  const max = Number(field.settings?.max ?? 5);
  const current = Number(value) || 0;
  return (
    <div id={domId} role="radiogroup" aria-label={field.label} className="flex gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={current === n}
          aria-label={`${n}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="rounded p-1 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Star className={cn("size-7", n <= current ? "fill-warning text-warning" : "text-muted-foreground")} />
        </button>
      ))}
    </div>
  );
}

export function ConsentInput({ field, domId, value, onChange, disabled }: FieldProps) {
  return (
    <label className="flex items-start gap-3">
      <Checkbox id={domId} className="mt-0.5" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{field.label}</span>
    </label>
  );
}
