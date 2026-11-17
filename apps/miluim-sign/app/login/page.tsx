"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Banner, Button, TextField, controlClass } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(body.error || "הכניסה נכשלה"); return; }
    const next = params.get("next") ?? "";
    const target = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
    router.push(target);
    router.refresh();
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-5">
        <h1 className="text-2xl font-semibold">כניסת קצינת קישור</h1>
        <p className="text-sm text-muted-foreground">הקלידו את קוד הכניסה שקיבלת.</p>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <TextField label="קוד כניסה">
          <input className={controlClass} type="password" autoComplete="current-password" value={passcode} onChange={(event) => setPasscode(event.target.value)} />
        </TextField>
        <Button type="submit" className="w-full" disabled={busy || passcode.length < 4}>{busy ? "נכנסים…" : "כניסה"}</Button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<p className="p-6">טוען…</p>}><LoginForm /></Suspense>;
}
