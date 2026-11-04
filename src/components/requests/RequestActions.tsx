"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelRequestAction, changeAssigneeAction, extendExpiryAction, returnStepAction, skipStepAction } from "@/app/admin/requests/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface OpenStep {
  id: string;
  label: string;
  name: string;
  email: string;
  phone: string;
}

type Panel = "cancel" | "extend" | "assignee" | "skip" | "return" | null;

export function RequestActions({ requestId, canExtend, canCancel, openSteps, doneSteps = [] }: { requestId: string; canExtend: boolean; canCancel: boolean; openSteps: OpenStep[]; doneSteps?: { id: string; label: string }[] }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(14);
  const [stepId, setStepId] = useState(openSteps[0]?.id ?? "");
  const current = openSteps.find((s) => s.id === stepId);
  const [who, setWho] = useState({ name: current?.name ?? "", email: current?.email ?? "", phone: current?.phone ?? "" });
  const [backTo, setBackTo] = useState(doneSteps[doneSteps.length - 1]?.id ?? "");
  const stepPicker = openSteps.length > 1 && (
    <div className="space-y-1">
      <Label htmlFor="act-step">איזה שלב</Label>
      <Select id="act-step" value={stepId} onChange={(e) => setStepId(e.target.value)}>
        {openSteps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </Select>
    </div>
  );

  function finish(r: { ok: boolean; message: string }) {
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok) {
      setPanel(null);
      setReason("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canExtend && (
          <Button variant="outline" size="sm" onClick={() => setPanel("extend")}>
            הארכת תוקף
          </Button>
        )}
        {openSteps.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setPanel("assignee")}>
            החלפת נמען
          </Button>
        )}
        {openSteps.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { setReason(""); setPanel("skip"); }}>
            דילוג על השלב
          </Button>
        )}
        {openSteps.length > 0 && doneSteps.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { setReason(""); setPanel("return"); }}>
            החזרה לשלב קודם
          </Button>
        )}
        {canCancel && (
          <Button variant="destructive" size="sm" onClick={() => setPanel("cancel")}>
            ביטול הבקשה
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className={message.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {message.text}
        </p>
      )}

      <Dialog open={panel === "extend"} onClose={() => setPanel(null)} title="הארכת תוקף" className="w-[min(92vw,26rem)]">
        <div className="space-y-3">
          <Label htmlFor="days">להאריך ב</Label>
          <Select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30, 60].map((d) => (
              <option key={d} value={d}>
                {d} ימים
              </option>
            ))}
          </Select>
          <Button disabled={pending} onClick={() => start(async () => finish(await extendExpiryAction(requestId, days)))}>
            אישור
          </Button>
        </div>
      </Dialog>

      <Dialog open={panel === "skip"} onClose={() => setPanel(null)} title="דילוג על השלב" className="w-[min(92vw,28rem)]">
        <div className="space-y-3">
          {stepPicker}
          <p className="text-sm">{current ? <>הבקשה תעבור לשלב הבא בלי <strong>{current.label}</strong>{current.name ? ` (${current.name})` : ""}.</> : null} הקישור של השלב יפסיק לעבוד.</p>
          <Label htmlFor="skip-reason">סיבה (לא חובה)</Label>
          <Textarea id="skip-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          <Button disabled={pending || !stepId} onClick={() => start(async () => finish(await skipStepAction(requestId, stepId, reason)))}>
            דילוג ומעבר לשלב הבא
          </Button>
        </div>
      </Dialog>

      <Dialog open={panel === "return"} onClose={() => setPanel(null)} title="החזרה לשלב קודם" className="w-[min(92vw,28rem)]">
        <div className="space-y-3">
          {stepPicker}
          <div className="space-y-1">
            <Label htmlFor="back-to">להחזיר אל</Label>
            <Select id="back-to" value={backTo} onChange={(e) => setBackTo(e.target.value)}>
              {doneSteps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </div>
          <Label htmlFor="return-reason">מה צריך לתקן</Label>
          <Textarea id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          <p className="text-xs text-muted-foreground">השלב שנבחר יקבל קישור חדש, ואחריו הבקשה תמשיך שוב לפי הסדר.</p>
          <Button disabled={pending || !stepId || !backTo || !reason.trim()} onClick={() => start(async () => finish(await returnStepAction(requestId, stepId, backTo, reason)))}>
            החזרה
          </Button>
        </div>
      </Dialog>

      <Dialog open={panel === "cancel"} onClose={() => setPanel(null)} title="ביטול הבקשה" className="w-[min(92vw,26rem)]">
        <div className="space-y-3">
          <Label htmlFor="reason">סיבת הביטול</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <p className="text-xs text-muted-foreground">הקישורים הפתוחים יפסיקו לעבוד. אי אפשר לשחזר.</p>
          <Button variant="destructive" disabled={pending || !reason.trim()} onClick={() => start(async () => finish(await cancelRequestAction(requestId, reason)))}>
            ביטול הבקשה
          </Button>
        </div>
      </Dialog>

      <Dialog open={panel === "assignee"} onClose={() => setPanel(null)} title="החלפת נמען" className="w-[min(92vw,28rem)]">
        <div className="space-y-3">
          {openSteps.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="step">שלב</Label>
              <Select
                id="step"
                value={stepId}
                onChange={(e) => {
                  setStepId(e.target.value);
                  const s = openSteps.find((x) => x.id === e.target.value);
                  setWho({ name: s?.name ?? "", email: s?.email ?? "", phone: s?.phone ?? "" });
                }}
              >
                {openSteps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {(
            [
              ["name", "שם", "text"],
              ["email", "מייל", "email"],
              ["phone", "טלפון", "tel"],
            ] as const
          ).map(([k, label, type]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`who-${k}`}>{label}</Label>
              <Input id={`who-${k}`} type={type} dir={k === "name" ? undefined : "ltr"} value={who[k]} onChange={(e) => setWho({ ...who, [k]: e.target.value })} />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">הקישור הקודם של השלב יפסיק לעבוד. אחרי ההחלפה צרו קישור חדש לשיתוף.</p>
          <Button disabled={pending || !stepId} onClick={() => start(async () => finish(await changeAssigneeAction(requestId, stepId, who)))}>
            החלפה
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
