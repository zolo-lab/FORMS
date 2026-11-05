"use client";
import { useActionState } from "react";
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
 * The user form. It runs the action through `useActionState`, so a refusal comes back as a message instead of a
 * fresh page: the form is never remounted and everything already typed or ticked stays exactly as it was.
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
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-5">
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
