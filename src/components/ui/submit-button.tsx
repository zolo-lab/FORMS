"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

/**
 * A form's submit button. While the form is being sent, the button that was pressed shows a spinner and every
 * button of the form is disabled. `saved` (usually from `?saved=…` after the redirect) shows "נשמר" right next to
 * the button for a few seconds, so the confirmation is where the person is looking, not at the top of the page.
 */
export function SubmitButton({
  children,
  saved = false,
  savedText = "נשמר",
  pendingText,
  name,
  value,
  disabled,
  ...props
}: Omit<ButtonProps, "type"> & { saved?: boolean; savedText?: string; pendingText?: string }) {
  const { pending, data } = useFormStatus();
  // With several submit buttons in one form (save / delete…), only the pressed one spins: its name=value is in the data.
  const mine = pending && (!name || !data || data.get(name) === String(value ?? ""));
  const [showSaved, setShowSaved] = useState(saved);
  useEffect(() => {
    setShowSaved(saved);
    if (!saved) return;
    const t = setTimeout(() => setShowSaved(false), 5000);
    return () => clearTimeout(t);
  }, [saved]);
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button type="submit" name={name} value={value} disabled={disabled || pending} aria-busy={mine || undefined} {...props}>
        {mine && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
        {mine && pendingText ? pendingText : children}
      </Button>
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-sm text-success empty:hidden">
        {showSaved && !pending ? (
          <>
            <Check className="size-4" aria-hidden />
            {savedText}
          </>
        ) : null}
      </span>
    </span>
  );
}
