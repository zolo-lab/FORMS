"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finalizeRequestAction } from "@/app/admin/requests/actions";
import { Button } from "@/components/ui/button";

export function FinalizeButton({ requestId, label = "יצירת קבצי PDF סופיים" }: { requestId: string; label?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await finalizeRequestAction(requestId);
            setMessage(r.message);
            router.refresh();
          })
        }
      >
        {pending ? "מכין…" : label}
      </Button>
      {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
    </div>
  );
}
