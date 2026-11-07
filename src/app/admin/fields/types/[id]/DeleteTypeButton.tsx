"use client";

import { Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";

/** Deleting a type cannot be undone, so the button asks first. */
export function DeleteTypeButton({ name }: { name: string }) {
  return (
    <SubmitButton variant="outline" className="text-destructive" onClick={(e) => { if (!confirm(`למחוק את סוג הרשימה "${name}"?`)) e.preventDefault(); }}>
      <Trash2 className="size-4" aria-hidden />מחיקת סוג הרשימה
    </SubmitButton>
  );
}
