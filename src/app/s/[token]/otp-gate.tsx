"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const MESSAGES: Record<string, string> = {
  wrong: "הקוד שגוי",
  expired: "הקוד פג תוקף – שלחו קוד חדש",
  locked: "יותר מדי ניסיונות. שלחו קוד חדש",
  missing: "טרם נשלח קוד",
  too_soon: "אפשר לבקש קוד חדש כעבור דקה",
  no_email: "לא הוגדרה כתובת מייל לשליחת הקוד. פנו למי ששלח לכם את הקישור",
};

export function OtpGate({ token }: { token: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/s/${token}/otp/send`, { method: "POST" });
    const data = (await res.json()) as { sentTo?: string; error?: string };
    setBusy(false);
    if (res.ok) setSentTo(data.sentTo ?? "");
    else setError(MESSAGES[data.error ?? ""] ?? "השליחה נכשלה");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/s/${token}/otp/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    if (res.ok) { window.location.reload(); return; }
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    setError(MESSAGES[data.error ?? ""] ?? "האימות נכשל");
  }

  return (
    <Card className="space-y-4 p-6">
      <h1 className="text-xl font-bold">אימות זהות</h1>
      <p className="text-sm text-muted-foreground">כדי לפתוח את המסמך נשלח קוד בן 6 ספרות לכתובת המייל שלכם.</p>
      {!sentTo ? (
        <Button onClick={send} disabled={busy} className="w-full">שלחו לי קוד</Button>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm">הקוד נשלח אל {sentTo}</p>
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" dir="ltr" className="text-center text-xl tracking-widest" aria-label="קוד אימות" />
          <Button type="submit" disabled={busy || code.length !== 6} className="w-full">אימות</Button>
          <Button type="button" variant="ghost" onClick={send} disabled={busy} className="w-full">שלחו קוד חדש</Button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}
