import { fieldStyleClass, type FieldStyle } from "@/lib/forms/field-style";
import { cn } from "@/lib/utils";

export function FieldShell({
  domId,
  label,
  description,
  required,
  error,
  hideLabel,
  style,
  children,
}: {
  domId: string;
  label: string;
  description?: string;
  required: boolean;
  error?: string;
  hideLabel?: boolean;
  style?: FieldStyle;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5" data-field={domId}>
      {!hideLabel && (
        <label htmlFor={domId} className={cn("block text-sm font-medium", fieldStyleClass(style))}>
          {label}
          {required && <span className="ms-1 text-destructive" aria-hidden="true">*</span>}
        </label>
      )}
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
