"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Banner, Button, EmptyState, StatusProgress } from "@/components/ui";
import { remindMessage, waLink } from "@/lib/phone";
import { formatWhen, type DocStatus, type DocumentRow } from "@/lib/types";

const filters: { id: "all" | "waiting" | "signed"; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "waiting", label: "ממתינים" },
  { id: "signed", label: "נחתמו" },
];

export function DashboardClient() {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const notified = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");

  const load = async () => {
    const res = await fetch("/api/documents");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || "לא ניתן לטעון"); return; }
    setDocs(body.documents);
    const fresh = (body.documents as DocumentRow[]).filter((doc) => doc.status === "signed" && !doc.seen && !notified.current.has(doc.id));
    if (fresh.length && typeof Notification !== "undefined" && Notification.permission === "granted") {
      const first = fresh[0]!;
      notified.current.add(first.id);
      new Notification("נחתם כתב הסכמה", { body: first.signerName || "חייל חתם על הטופס" });
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = (docs ?? []).filter((doc) => filter === "all" ? true : filter === "signed" ? doc.status === "signed" : doc.status !== "signed");
  const waiting = (docs ?? []).filter((doc) => doc.status !== "signed").length;
  const signed = (docs ?? []).filter((doc) => doc.status === "signed").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">הטפסים שנשלחו</h1>
          <p className="text-sm text-muted-foreground">{waiting} ממתינים · {signed} נחתמו</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/new" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground">טופס חדש</Link>
          {signed ? <a className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-4 font-medium" href="/api/export/zip">הורדת כל החתומים</a> : null}
        </div>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="flex gap-2">
        {filters.map((item) => (
          <Button key={item.id} variant={filter === item.id ? "primary" : "quiet"} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</Button>
        ))}
      </div>
      {docs === null ? <p role="status">טוען…</p> : rows.length === 0 ? (
        <EmptyState title="עדיין אין טפסים" body="צלמו כתב הסכמה, סמנו איפה חותמים, ושלחו קישור בוואטסאפ." action={<Link className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground" href="/new">צילום טופס חדש</Link>} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((doc) => <Card key={doc.id} doc={doc} />)}
        </ul>
      )}
    </div>
  );
}

function Card({ doc }: { doc: DocumentRow }) {
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/s/${doc.token}`;
  const href = doc.status === "signed" ? null : waLink(doc.signerPhone, remindMessage(doc.signerName, link));
  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{doc.signerName || doc.signerPhone || "ללא שם"}</h2>
          <p className="text-sm text-muted-foreground">{doc.title} · {formatWhen(doc.createdAt)}{doc.status === "signed" && !doc.seen ? " · חדש" : ""}</p>
        </div>
      </div>
      <StatusProgress status={doc.status as DocStatus} />
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-4 font-medium" href={`/forms/${doc.id}`}>פתיחה</Link>
        {href ? <a className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-medium text-accent-foreground" href={href} target="_blank" rel="noreferrer">תזכורת בוואטסאפ</a> : null}
      </div>
    </li>
  );
}
