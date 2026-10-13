"use client";
import { useState } from "react";
import { Input, Textarea } from "@/components/ui/input";
import { formatIsraeliPhone, isValidIsraeliId } from "@/lib/validators/israeli";
import type { FieldProps } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

type Mode = { type?: string; inputMode?: "text" | "numeric" | "decimal" | "tel" | "email"; ltr?: boolean; prefix?: string; suffix?: string; maxLength?: number };

const MODES: Record<string, Mode> = {
  short_text: {},
  email: { type: "email", inputMode: "email", ltr: true },
  number: { inputMode: "decimal", ltr: true },
  currency: { inputMode: "decimal", ltr: true, suffix: "₪" },
  percent: { inputMode: "decimal", ltr: true, suffix: "%" },
  phone: { type: "tel", inputMode: "tel", ltr: true },
  id_number: { inputMode: "numeric", ltr: true, maxLength: 9 },
  date: { type: "date", ltr: true },
  time: { type: "time", ltr: true },
};

/** short_text, email, number, currency, percent, phone, id_number, date, time. */
export function TextLikeInput({ field, domId, value, onChange, disabled, invalid }: FieldProps) {
  const mode = MODES[field.type] ?? {};
  const [touched, setTouched] = useState(false);
  const text = str(value);
  const live = field.type === "id_number" && touched && text !== "" && !isValidIsraeliId(text) ? "מספר תעודת זהות לא תקין" : null;
  const v = field.validation;
  return (
    <div>
      <div className="flex items-center gap-2">
        <Input
          id={domId}
          type={mode.type ?? "text"}
          inputMode={mode.inputMode}
          dir={mode.ltr ? "ltr" : undefined}
          className={mode.ltr ? "text-start" : undefined}
          value={text}
          placeholder={field.placeholder}
          disabled={disabled}
          maxLength={mode.maxLength ?? v?.maxLength}
          min={field.type === "date" ? v?.minDate : undefined}
          max={field.type === "date" ? v?.maxDate : undefined}
          aria-invalid={invalid || !!live}
          aria-describedby={field.description ? `${domId}-desc` : undefined}
          autoComplete={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "off"}
          onChange={(e) => onChange(field.type === "id_number" ? e.target.value.replace(/\D/g, "") : e.target.value)}
          onBlur={() => {
            setTouched(true);
            if (field.type === "phone" && text) onChange(formatIsraeliPhone(text));
          }}
        />
        {mode.suffix && <span className="text-muted-foreground">{mode.suffix}</span>}
      </div>
      {live && <p role="alert" className="mt-1.5 text-sm text-destructive">{live}</p>}
    </div>
  );
}

export function LongTextInput({ field, domId, value, onChange, disabled, invalid }: FieldProps) {
  return (
    <Textarea
      id={domId}
      rows={Number(field.settings?.rows ?? 4)}
      value={str(value)}
      placeholder={field.placeholder}
      disabled={disabled}
      maxLength={field.validation?.maxLength}
      aria-invalid={invalid}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
