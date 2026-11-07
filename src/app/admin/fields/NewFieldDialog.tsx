"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { DICTIONARY_TYPES, DICTIONARY_TYPE_LABELS } from "@/lib/fields/types";
import { createFieldAction } from "./actions";

/** "שדה חדש": a button that opens the add form in a window (reopened by the page after a refused add). */
export function NewFieldDialog({ initialOpen = false, error }: { initialOpen?: boolean; error?: string | null }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />שדה חדש</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="שדה חדש" fullScreenOnMobile>
        <form action={createFieldAction} className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">שדה חדש</h2>
          {error && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="nf-label">שם השדה</Label>
            <Input id="nf-label" name="label" required maxLength={80} placeholder="למשל: שם ספק" autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nf-type">סוג</Label>
              <Select id="nf-type" name="type" defaultValue="short_text">
                {DICTIONARY_TYPES.map((t) => <option key={t} value={t}>{DICTIONARY_TYPE_LABELS[t]}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nf-cat">שייך ל</Label>
              <Select id="nf-cat" name="category" defaultValue="general">
                <option value="general">כללי</option>
                <option value="org">עמותה (ערך לכל עמותה)</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nf-key">שם פנימי (לא חובה)</Label>
            <Input id="nf-key" name="key" maxLength={40} dir="ltr" placeholder="ייווצר אוטומטית" pattern="[a-zA-Z][a-zA-Z0-9_]*" title="אות באנגלית בהתחלה, ואחריה אותיות, ספרות או קו תחתון" className="font-mono text-sm" />
          </div>
          <p className="text-xs text-muted-foreground">שדה עמותה מקבל רק סוגים של שורה אחת. את הערך של כל עמותה ממלאים במסך העמותות.</p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton>הוספה</SubmitButton>
            <Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
