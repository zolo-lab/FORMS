"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { retryDeliveryAction } from "@/app/admin/requests/actions";
import { Button } from "@/components/ui/button";

/** Sends one destination of "עיבוד טופס" again, after it failed. */
export function RetryDelivery({ requestId, destinationId }: { requestId: string; destinationId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => start(async () => { const r = await retryDeliveryAction(requestId, destinationId); setMessage(r.message); router.refresh(); })}
      >
        {pending ? "שולח…" : "נסה שוב"}
      </Button>
      {message && <span role="status" className="text-xs text-muted-foreground">{message}</span>}
    </span>
  );
}
