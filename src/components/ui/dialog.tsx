"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Modal built on the native <dialog> element: focus trap, Esc and backdrop come for free. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  fullScreenOnMobile,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  fullScreenOnMobile?: boolean;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className={cn(
        "m-auto w-[min(92vw,32rem)] rounded-lg border bg-card p-0 text-card-foreground backdrop:bg-foreground/40",
        fullScreenOnMobile && "max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:max-w-none max-sm:rounded-none",
        className,
      )}
    >
      {open && (
        <div className="flex h-full flex-col p-4">
          <h2 className="mb-3 text-lg font-semibold">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
