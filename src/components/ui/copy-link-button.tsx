"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "./button";

/** Copies the full address of `path` (on this site) and says so next to the button for a few seconds. */
export function CopyLinkButton({ path, children = "העתקת קישור למילוי", ...props }: Omit<ButtonProps, "onClick" | "type"> & { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        {...props}
        onClick={async () => {
          const url = new URL(path, window.location.origin).href;
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            window.prompt("העתיקו את הקישור:", url);
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        }}
      >
        <Copy className="size-4" aria-hidden />
        {children}
      </Button>
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-xs text-success empty:hidden">
        {copied ? (
          <>
            <Check className="size-3.5" aria-hidden />
            הועתק
          </>
        ) : null}
      </span>
    </span>
  );
}
