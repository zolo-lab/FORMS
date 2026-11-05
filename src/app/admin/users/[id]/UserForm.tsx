"use client";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";

/** What `saveUserAction` returns when it refuses to save; `null` = nothing was tried yet. */
export interface SaveUserState {
  error: string;
}

const ERRORS: Record<string, string> = {
  name: "יש להזין שם",
  email: "כתובת המייל לא תקינה",
  phone: "מספר הטלפון לא תקין",
  exists: "כבר יש משתמש עם המייל הזה",
  self: "אי אפשר להוריד מעצמך את סוג אדמין או להפוך את עצמך ללא פעיל",
  orgs: "בחרת \"רק המסומנים\" בלי לסמן אף עמותה או עסק",
  input: "קלט לא תקין",
};

/**
 * Puts a submission back into the form. React empties an uncontrolled form once its action finishes, so after a
 * refusal every field would be back to what the server rendered; this writes the submitted values in again.
 */
function restore(form: HTMLFormElement, data: FormData) {
  for (const el of form.elements) {
    const f = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!f.name || f.tagName === "BUTTON") continue;
    if (f instanceof HTMLInputElement && f.type === "file") continue;
    if (f instanceof HTMLInputElement && (f.type === "checkbox" || f.type === "radio")) {
      const sent = data.getAll(f.name).map(String);
      // A checkbox with no value of its own is sent as "on"; a radio group sends only the chosen one.
      f.checked = sent.includes(f.value || "on");
      continue;
    }
    const v = data.get(f.name);
    if (typeof v === "string") f.value = v;
  }
}

/**
 * The user form. The action runs through `useActionState`, so a refusal comes back as a message instead of a fresh
 * page, and everything already typed or ticked is put back into the form exactly as it was sent.
 */
export function UserForm({
  action,
  saved,
  submitLabel,
  children,
}: {
  action: (prev: SaveUserState | null, fd: FormData) => Promise<SaveUserState | null>;
  saved: boolean;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const sent = useRef<FormData | null>(null);
  const [state, formAction] = useActionState(async (prev: SaveUserState | null, fd: FormData) => {
    sent.current = fd;
    return action(prev, fd);
  }, null);

  useEffect(() => {
    if (state?.error && sent.current && form.current) restore(form.current, sent.current);
  }, [state]);

  return (
    <form ref={form} action={formAction} className="space-y-5">
      {state?.error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {ERRORS[state.error] ?? ERRORS.input}
        </p>
      )}
      {children}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <SubmitButton saved={saved}>{submitLabel}</SubmitButton>
        <Link href="/admin/users" className="inline-flex h-10 items-center px-4 text-sm text-muted-foreground hover:text-foreground">ביטול</Link>
      </div>
    </form>
  );
}
