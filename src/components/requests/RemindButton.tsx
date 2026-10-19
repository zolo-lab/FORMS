"use client";
import { useState, useTransition } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { remindNowAction } from "@/app/admin/track/actions";

/** Sends one reminder to whoever the request waits for; shows the result next to the button. */
export function RemindButton({ requestId, subject }: { requestId: string; subject: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label={`שליחת תזכורת עכשיו – ${subject}`}
        onClick={() =>
          start(async () => {
            const r = await remindNowAction(requestId);
            setMsg({ ok: r.ok, text: r.message });
          })
        }
      >
        <BellRing className="size-4" aria-hidden="true" />
        {pending ? "שולח…" : "תזכורת"}
      </Button>
      {msg && (
        <span role="status" className={`text-xs ${msg.ok ? "text-success" : "text-destructive"}`}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
