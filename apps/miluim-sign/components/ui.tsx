import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { DocStatus } from "@/lib/types";

const variants = {
  primary: "bg-primary text-primary-foreground",
  accent: "bg-accent text-accent-foreground",
  quiet: "bg-secondary text-secondary-foreground",
  ghost: "bg-transparent text-foreground",
  danger: "bg-destructive text-destructive-foreground",
} as const;

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-base font-medium transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function TextField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error ? <span className="mt-1 block text-sm text-muted-foreground">{hint}</span> : null}
      {error ? <span role="alert" className="mt-1 block text-sm text-destructive">{error}</span> : null}
    </label>
  );
}

export const controlClass = "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base outline-none";

export function Banner({ tone = "info", children }: { tone?: "info" | "error"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-3 text-sm ${tone === "error" ? "bg-destructive/10 text-destructive" : "bg-secondary text-foreground"}`}>
      {children}
    </p>
  );
}

export function StatusProgress({ status }: { status: DocStatus }) {
  const step = status === "signed" ? 3 : status === "opened" ? 2 : 1;
  const labels = ["נשלח", "נפתח", "נחתם"];
  return (
    <div aria-label={`מצב: ${labels[step - 1]}, שלב ${step} מתוך 3`}>
      <div className="flex gap-1">
        {labels.map((label, index) => (
          <div key={label} className={`h-2 flex-1 rounded-full ${index < step ? (status === "signed" ? "bg-success" : "bg-primary") : "bg-muted"}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        {labels.map((label, index) => (
          <span key={label} className={index + 1 === step ? "font-semibold text-foreground" : ""}>{label}</span>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
