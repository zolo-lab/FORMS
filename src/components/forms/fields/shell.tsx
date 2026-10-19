"use client";
import { useState } from "react";
import { fieldStyleClass, type FieldStyle } from "@/lib/forms/field-style";
import { cn } from "@/lib/utils";

export function FieldShell({
  domId,
  label,
  description,
  hint,
  required,
  error,
  hideLabel,
  style,
  children,
}: {
  domId: string;
  label: string;
  description?: string;
  hint?: string;
  required: boolean;
  error?: string;
  hideLabel?: boolean;
  style?: FieldStyle;
  children: React.ReactNode;
}) {
  const [showHint, setShowHint] = useState(false);
  return (
    <div className="space-y-1.5" data-field={domId}>
      {!hideLabel && (
        <label htmlFor={domId} className={cn("block text-sm font-medium", fieldStyleClass(style))}>
          {label}
          {required && <span className="ms-1 text-destructive" aria-hidden="true">*</span>}
          {hint && (
            <span className="ms-1 inline-flex align-middle">
              <button
                type="button"
                className="inline-flex size-6 items-center justify-center rounded-full border text-xs font-bold text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`הסבר על ${label}`}
                aria-expanded={showHint}
                aria-controls={`${domId}-hint`}
                title={hint}
                onClick={(e) => {
                  e.preventDefault();
                  setShowHint((v) => !v);
                }}
              >
                i
              </button>
            </span>
          )}
        </label>
      )}
      {hint && showHint && <p id={`${domId}-hint`} className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{hint}</p>}
      {description && <p id={`${domId}-desc`} className="text-sm text-muted-foreground">{description}</p>}
      {children}
      {error && (
        <p id={`${domId}-err`} role="alert" className={cn("text-sm text-destructive")}>
          {error}
        </p>
      )}
    </div>
  );
}
