"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelRequestAction, changeAssigneeAction, extendExpiryAction } from "@/app/admin/requests/actions";
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

type Panel = "cancel" | "extend" | "assignee" | null;

export function RequestActions({ requestId, canExtend, canCancel, openSteps }: { requestId: string; canExtend: boolean; canCancel: boolean; openSteps: OpenStep[] }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(14);
  const [stepId, setStepId] = useState(openSteps[0]?.id ?? "");
  const current = openSteps.find((s) => s.id === stepId);
  const [who, setWho] = useState({ name: current?.name ?? "", email: current?.email ?? "", phone: current?.phone ?? "" });

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
