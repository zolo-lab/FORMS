"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { deleteFormAction } from "./actions";

/** "מחיקה" in the forms list: one confirmation click (the admin asked not to type anything). */
export function DeleteFormButton({ id, title, requests }: { id: string; title: string; requests: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" type="button" className="text-destructive" onClick={() => setOpen(true)} aria-label={`מחיקת הטופס ${title}`}>
        <Trash2 className="size-4" />מחיקה
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="מחיקת הטופס">
        <form action={deleteFormAction} onSubmit={() => setBusy(true)} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <p className="text-sm">
            הטופס <span className="font-medium">{title}</span> יימחק לצמיתות, כולל כל הגרסאות שלו והמסמך. אי אפשר לבטל את זה.
          </p>
          {requests > 0 ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {requests === 1 ? "בקשה אחת השתמשה בטופס, והיא תימחק" : `${requests} בקשות השתמשו בטופס, והן יימחקו`} יחד עם החתימות וההיסטוריה שלהן.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">אף בקשה לא השתמשה בטופס. אם רק רוצים להסתיר אותו – עדיף &quot;ארכוב&quot;.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
            <Button type="submit" variant="destructive" disabled={busy}>{busy ? "מוחק…" : "מחיקה לצמיתות"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
