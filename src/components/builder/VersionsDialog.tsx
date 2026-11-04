"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listVersionsAction, restoreVersionAction } from "@/app/admin/forms/actions";

type VersionRow = Awaited<ReturnType<typeof listVersionsAction>>[number];

const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });

/** The form's published versions; going back to one makes it the current draft (published only when you publish). */
export function VersionsDialog({ templateId, open, onClose }: { templateId: string; open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listVersionsAction(templateId)
      .then((r) => { if (alive) { setRows(r); setError(null); } })
      .catch(() => { if (alive) setError("לא הצלחנו לטעון את הגרסאות"); });
    return () => { alive = false; };
  }, [open, templateId]);

  async function restore(v: number) {
    setBusy(v);
    setError(null);
    try {
      const r = await restoreVersionAction(templateId, v);
      if ("error" in r) { setError(r.error); setBusy(null); return; }
      window.location.reload();
    } catch {
      setError("השחזור נכשל");
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="גרסאות קודמות">
      <p className="mb-3 text-sm text-muted-foreground">כל פרסום נשמר כגרסה. חזרה לגרסה הופכת אותה לטיוטה הנוכחית, והיא נכנסת לשימוש רק אחרי &quot;פרסום&quot;. שינויים שעוד לא פורסמו יוחלפו.</p>
      {error && <p role="alert" className="mb-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
      {!rows && !error && <p role="status" className="py-6 text-center text-sm text-muted-foreground">טוען…</p>}
      {rows && rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">עוד אין גרסאות שפורסמו.</p>}
      {rows && rows.length > 0 && (
        <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-md border">
          {rows.map((r) => (
            <li key={r.version} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  גרסה {r.version}
                  {r.inUse && <span className="ms-2 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">בשימוש</span>}
                </p>
                <p className="text-xs text-muted-foreground">פורסמה {fmt.format(new Date(r.publishedAt))} · {r.fields} שדות</p>
              </div>
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => restore(r.version)}>
                {busy === r.version && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
                חזרה לגרסה הזו
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose}>סגירה</Button>
      </div>
    </Dialog>
  );
}
