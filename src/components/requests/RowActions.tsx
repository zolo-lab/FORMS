"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, BellRing, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { remindNowAction } from "@/app/admin/track/actions";
import { declineRequestAction, deleteRequestAction, returnOneStepAction } from "@/app/admin/requests/actions";
import { cn } from "@/lib/utils";

type Panel = "return" | "decline" | "delete" | null;

/**
 * The actions of one request, in its own row, in a fixed order: reminder, one step back (to fix something),
 * decline, delete. Each shows only when it makes sense for the request's state.
 */
export function RowActions({ requestId, subject, live, waiting, canGoBack, canManage }: {
  requestId: string;
  subject: string;
  /** Still running (in progress or returned). */
  live: boolean;
  /** Someone is being waited for right now. */
  waiting: boolean;
  /** A step before the waiting one is done, so it can go back. */
  canGoBack: boolean;
  /** May decline / delete. */
  canManage: boolean;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const act = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setPanel(null);
        setReason("");
        router.refresh();
      }
    });
  const open = (p: Panel) => { setReason(""); setMsg(null); setPanel(p); };

  const icon = "size-8";
  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex items-center gap-0.5">
        {live && waiting && (
          <Button type="button" variant="ghost" size="icon" className={icon} disabled={pending} title="תזכורת" aria-label={`תזכורת – ${subject}`} onClick={() => act(() => remindNowAction(requestId))}>
            <BellRing className="size-4" aria-hidden />
          </Button>
        )}
        {live && canGoBack && (
          <Button type="button" variant="ghost" size="icon" className={icon} disabled={pending} title="החזרה שלב אחד אחורה" aria-label={`החזרה שלב אחד אחורה – ${subject}`} onClick={() => open("return")}>
            <Undo2 className="size-4" aria-hidden />
          </Button>
        )}
        {live && canManage && (
          <Button type="button" variant="ghost" size="icon" className={cn(icon, "text-destructive")} disabled={pending} title="דחייה" aria-label={`דחיית הבקשה – ${subject}`} onClick={() => open("decline")}>
            <Ban className="size-4" aria-hidden />
          </Button>
        )}
        {canManage && (
          <Button type="button" variant="ghost" size="icon" className={cn(icon, "text-destructive")} disabled={pending} title="מחיקה" aria-label={`מחיקת הבקשה – ${subject}`} onClick={() => open("delete")}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        )}
      </div>
      {msg && !panel && <span role="status" className={cn("text-xs", msg.ok ? "text-success" : "text-destructive")}>{msg.text}</span>}

      <Dialog open={panel === "return"} onClose={() => setPanel(null)} title={`החזרה שלב אחד אחורה – ${subject}`} className="w-[min(92vw,28rem)]">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">השלב הקודם יקבל קישור חדש כדי לתקן, ואחריו הבקשה תמשיך שוב לפי הסדר.</p>
          <Label htmlFor={`ret-${requestId}`}>מה צריך לתקן</Label>
          <Textarea id={`ret-${requestId}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          {msg && !msg.ok && <p role="alert" className="text-sm text-destructive">{msg.text}</p>}
          <Button disabled={pending || !reason.trim()} onClick={() => act(() => returnOneStepAction(requestId, reason))}>החזרה</Button>
        </div>
      </Dialog>

      <Dialog open={panel === "decline"} onClose={() => setPanel(null)} title={`דחיית הבקשה – ${subject}`} className="w-[min(92vw,28rem)]">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">הבקשה נעצרת ולא תמשיך לשלבים הבאים. הקישורים הפתוחים יפסיקו לעבוד.</p>
          <Label htmlFor={`dec-${requestId}`}>סיבת הדחייה</Label>
          <Textarea id={`dec-${requestId}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          {msg && !msg.ok && <p role="alert" className="text-sm text-destructive">{msg.text}</p>}
          <Button variant="destructive" disabled={pending || !reason.trim()} onClick={() => act(() => declineRequestAction(requestId, reason))}>דחייה</Button>
        </div>
      </Dialog>

      <Dialog open={panel === "delete"} onClose={() => setPanel(null)} title={`מחיקת הבקשה – ${subject}`} className="w-[min(92vw,26rem)]">
        <div className="space-y-3">
          <p className="text-sm">הבקשה תימחק לגמרי, עם התשובות, החתימות וההיסטוריה שלה. <strong>אי אפשר לשחזר.</strong></p>
          {msg && !msg.ok && <p role="alert" className="text-sm text-destructive">{msg.text}</p>}
          <div className="flex gap-2">
            <Button variant="destructive" disabled={pending} onClick={() => act(() => deleteRequestAction(requestId))}>מחיקה</Button>
            <Button variant="ghost" onClick={() => setPanel(null)}>ביטול</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
