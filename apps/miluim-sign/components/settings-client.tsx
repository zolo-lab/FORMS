"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button } from "@/components/ui";

function keyBytes(value: string) {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function SettingsClient() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enable = async () => {
    setError(null);
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setError("הדפדפן הזה לא תומך בהתראות");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { setError("ההתראות לא אושרו"); return; }
    const keyRes = await fetch("/api/push");
    const { publicKey } = await keyRes.json();
    if (!publicKey) { setMessage("ההתראות במכשיר פעילות כל עוד האפליקציה פתוחה. שרת ההתראות עדיין לא הוגדר."); return; }
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    const json = sub.toJSON();
    await fetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    setMessage("ההתראות פעילות. כשחייל יחתום תגיע הודעה.");
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">הגדרות</h1>
      {message ? <Banner>{message}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">התראה כשחותמים</h2>
        <p className="text-sm text-muted-foreground">כשחייל מסיים, מופיעה הודעה. ברשימה הטפסים החדשים מסומנים.</p>
        <Button onClick={enable}>הפעלת התראות</Button>
      </section>
      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">הוספה למסך הבית</h2>
        <p className="text-sm text-muted-foreground">באייפון: כפתור השיתוף, ואז «הוספה למסך הבית». באנדרואיד: תפריט הדפדפן, «התקנת אפליקציה».</p>
      </section>
      <Button variant="quiet" onClick={async () => {
        try {
          const registration = await navigator.serviceWorker?.getRegistration();
          const subscription = await registration?.pushManager.getSubscription();
          const endpoint = subscription?.endpoint;
          await subscription?.unsubscribe().catch(() => undefined);
          if (endpoint) {
            await Promise.race([
              fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint }) }).catch(() => undefined),
              new Promise((resolve) => setTimeout(resolve, 3000)),
            ]);
          }
        } catch { /* logout still proceeds */ }
        await fetch("/api/logout", { method: "POST" });
        router.push("/login");
      }}>יציאה</Button>
    </div>
  );
}
