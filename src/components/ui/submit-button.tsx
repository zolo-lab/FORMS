"use client";

import { Check } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/** A form's submit button that says "שומר…" while saving, and "נשמר" next to it when `saved` (after the redirect). */
export function SubmitButton({ children, saved = false }: { children: React.ReactNode; saved?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>{pending ? "שומר…" : children}</Button>
      {saved && !pending && <span role="status" className="inline-flex items-center gap-1 text-sm text-success"><Check className="size-4" aria-hidden />נשמר</span>}
    </span>
  );
}
