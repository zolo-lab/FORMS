import * as React from "react";
import { cn } from "@/lib/utils";

/** Native checkbox / radio styled with tokens (accessible by default, RTL-safe). */
export function Checkbox({ className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input type="checkbox" className={cn("size-5 shrink-0 accent-primary", className)} {...props} />;
}
export function Radio({ className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input type="radio" className={cn("size-5 shrink-0 accent-primary", className)} {...props} />;
}
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-card shadow transition-transform",
          checked ? "ltr:translate-x-5 rtl:-translate-x-5" : "translate-x-0",
          "mx-0.5",
        )}
      />
    </button>
  );
}
