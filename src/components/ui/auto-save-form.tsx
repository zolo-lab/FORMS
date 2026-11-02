"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AutoSaveResult = { ok: true } | { ok: false; error: string };

type Status = "idle" | "saving" | "saved" | "error";

/**
 * A form with no save button: it saves itself. Ticks, selects and files save at once; typed text saves after a short
 * pause and when the field is left. Fields tied to the form with the `form="…"` attribute (e.g. table cells) count too.
 * The action returns a result instead of redirecting, so the page does not jump and focus stays where it was.
 */
export function AutoSaveForm({
  action,
  id,
  className,
  statusClassName,
  errors,
  delay = 700,
  children,
}: {
  action: (formData: FormData) => Promise<AutoSaveResult>;
  id?: string;
  className?: string;
  statusClassName?: string;
  /** Error code → Hebrew message. */
  errors?: Record<string, string>;
  delay?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const lastSaved = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const saveRef = useRef<() => Promise<void>>(async () => {});
  const save = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const form = ref.current;
    if (!form) return;
    // One save at a time; a change made meanwhile is saved right after.
    if (running.current) {
      again.current = true;
      return;
    }
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const fd = new FormData(form);
    // Nothing changed since the last save (e.g. leaving a field that was already saved after the pause) → skip.
    const snap = JSON.stringify([...fd.entries()].map(([k, v]) => [k, v instanceof File ? `${v.name}:${v.size}` : v]));
    const hasFile = [...fd.values()].some((v) => v instanceof File && v.size > 0);
    if (snap === lastSaved.current && !hasFile) return;
    running.current = true;
    setStatus("saving");
    try {
      const r = await action(fd);
      if (r.ok) {
        lastSaved.current = snap;
        setStatus("saved");
        setError(null);
        // A picked file was uploaded; don't send it again with the next change.
        form.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((f) => (f.value = ""));
      } else {
        setStatus("error");
        setError(errors?.[r.error] ?? "שגיאה בשמירה");
      }
    } catch {
      setStatus("error");
      setError("שגיאה בשמירה");
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        void saveRef.current();
      }
    }
  };
  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    if (!ref.current) return;
    const fd = new FormData(ref.current);
    lastSaved.current = JSON.stringify([...fd.entries()].map(([k, v]) => [k, v instanceof File ? `${v.name}:${v.size}` : v]));
  }, []);

  useEffect(() => {
    const mine = (t: EventTarget | null) =>
      !!ref.current && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) && t.form === ref.current;
    const isText = (t: EventTarget | null) =>
      (t instanceof HTMLInputElement && !["checkbox", "radio", "file", "color"].includes(t.type)) || t instanceof HTMLTextAreaElement;
    const onInput = (e: Event) => {
      if (!mine(e.target) || !isText(e.target)) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void saveRef.current(), delay);
    };
    const onChange = (e: Event) => {
      if (!mine(e.target)) return;
      // Text fields fire "change" when left – save now instead of waiting for the pause.
      void saveRef.current();
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onChange, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [delay]);

  return (
    <form
      ref={ref}
      id={id}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        void saveRef.current();
      }}
    >
      {children}
      <span role="status" aria-live="polite" className={cn("inline-flex min-h-5 items-center gap-1 text-xs", statusClassName)}>
        {status === "saving" && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden /> שומר…
          </span>
        )}
        {status === "saved" && (
          <span className="inline-flex items-center gap-1 text-success">
            <Check className="size-3.5" aria-hidden /> נשמר
          </span>
        )}
        {status === "error" && (
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertCircle className="size-3.5" aria-hidden /> {error}
          </span>
        )}
      </span>
    </form>
  );
}
