"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { createListTypeAction } from "./actions";

/** "סוג רשימה חדש": a name, then the type's own screen to pick its fields. */
export function NewTypeDialog({ initialOpen = false, error }: { initialOpen?: boolean; error?: string | null }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />סוג רשימה חדש</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="סוג רשימה חדש" fullScreenOnMobile>
        <form action={createListTypeAction} className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">סוג רשימה חדש</h2>
          {error && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="nt-name">שם</Label>
            <Input id="nt-name" name="name" required maxLength={80} placeholder="למשל: ספקים, מקומות עבודה" autoFocus />
          </div>
          <p className="text-xs text-muted-foreground">אחרי היצירה בוחרים את השדות של הסוג מתוך השדות המזהים, או מוסיפים חדשים.</p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton>יצירה</SubmitButton>
            <Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
