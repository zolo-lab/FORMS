"use client";

import { Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";

/** Deleting a store cannot be undone, so the button asks first. */
export function DeleteStoreButton({ name, rows }: { name: string; rows: number }) {
  return (
    <SubmitButton
      variant="outline"
      className="text-destructive"
      onClick={(e) => { if (!confirm(`למחוק את המאגר "${name}" ואת ${rows} השורות שלו? אי אפשר לבטל.`)) e.preventDefault(); }}
    >
      <Trash2 className="size-4" aria-hidden />מחיקת המאגר
    </SubmitButton>
  );
}
