"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner, Button, EmptyState, controlClass } from "@/components/ui";
import { KIND_LABEL, formatWhen, type FieldKind, type TemplateRow } from "@/lib/types";

export function TemplatesClient() {
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TemplateRow | null>(null);

  const load = async () => {
    const res = await fetch("/api/templates");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || "לא ניתן לטעון"); return; }
    setRows(body.templates);
  };
  useEffect(() => { void load(); }, []);

  const counts = (row: TemplateRow) => (["signature", "name", "id", "date"] as FieldKind[])
    .map((kind) => ({ kind, n: row.fields.filter((field) => field.kind === kind).length }))
    .filter((item) => item.n > 0)
    .map((item) => `${item.n} ${KIND_LABEL[item.kind]}`)
    .join(" · ");

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">תבניות</h1>
          <p className="text-sm text-muted-foreground">פריסת שדות שמורה. מצלמים עותק חדש והשדות נוחתים באותם מקומות.</p>
        </div>
        <Link href="/new" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground">תבנית חדשה</Link>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {rows === null ? <p role="status">טוען…</p> : rows.length === 0 ? (
        <EmptyState title="עדיין אין תבניות" body="אחרי סימון השדות אפשר לשמור תבנית בשם, ולשלוח אותה שוב בלי לסמן מחדש." action={<Link className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground" href="/new">יצירת תבנית</Link>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <li key={row.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <Link href={`/templates/${row.id}`} className="block bg-muted">
                {row.thumbPath ? (
                  <img src={`/api/file?url=${encodeURIComponent(row.thumbPath)}`} alt="" className="aspect-[3/4] w-full object-cover object-top" />
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center text-sm text-muted-foreground">אין תצוגה</div>
                )}
              </Link>
              <div className="space-y-3 p-3">
                {rename === row.id ? (
                  <form className="flex gap-2" onSubmit={async (event) => {
                    event.preventDefault();
                    const res = await fetch(`/api/templates/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
                    const body = await res.json().catch(() => ({}));
                    if (!res.ok) { setError(body.error || "שינוי השם נכשל"); return; }
                    setRename(null);
                    await load();
                  }}>
                    <input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} aria-label="שם התבנית" />
                    <Button type="submit">שמירה</Button>
                  </form>
                ) : <h2 className="text-lg font-semibold">{row.name}</h2>}
                <p className="text-sm text-muted-foreground">{counts(row) || "בלי שדות"} · {formatWhen(row.updatedAt)}</p>
                <div className="flex flex-wrap gap-2">
                  <Link className="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground" href={`/new?template=${row.id}`}>שליחה</Link>
                  <Link className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-3 text-sm font-medium" href={`/templates/${row.id}`}>עריכה</Link>
                  <Button variant="quiet" onClick={async () => {
                    const res = await fetch(`/api/templates/${row.id}/duplicate`, { method: "POST" });
                    if (!res.ok) { setError("השכפול נכשל"); return; }
                    await load();
                  }}>שכפול</Button>
                  <Button variant="ghost" onClick={() => { setRename(row.id); setName(row.name); }}>שינוי שם</Button>
                  <Button variant="danger" onClick={() => setPendingDelete(row)}>מחיקה</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pendingDelete ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-foreground/40 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="del-title" className="w-full max-w-md space-y-3 rounded-t-lg bg-card p-4 sm:rounded-lg">
            <h2 id="del-title" className="text-lg font-semibold">למחוק את «{pendingDelete.name}»?</h2>
            <p className="text-sm text-muted-foreground">טפסים שכבר נשלחו לא נמחקים.</p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={async () => {
                await fetch(`/api/templates/${pendingDelete.id}`, { method: "DELETE" });
                setPendingDelete(null);
                await load();
              }}>מחיקה</Button>
              <Button variant="quiet" onClick={() => setPendingDelete(null)}>ביטול</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
