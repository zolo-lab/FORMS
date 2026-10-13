import { cn } from "@/lib/utils";

export function FieldShell({
  domId,
  label,
  description,
  required,
  error,
  hideLabel,
  children,
}: {
  domId: string;
  label: string;
  description?: string;
  required: boolean;
  error?: string;
  hideLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5" data-field={domId}>
      {!hideLabel && (
        <label htmlFor={domId} className="block text-sm font-medium">
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
