"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FieldStage, type StageMode } from "@/components/field-stage";
import { Banner, Button, TextField, controlClass } from "@/components/ui";
import { KIND_LABEL, type EditorField, type Field, type FieldKind, type TemplateRow } from "@/lib/types";

export function TemplateEditor({ id }: { id: string }) {
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [fields, setFields] = useState<EditorField[]>([]);
  const [name, setName] = useState("");
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<StageMode>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const res = await fetch(`/api/templates/${id}`);
      const body = await res.json().catch(() => ({}));
      if (cancel) return;
      if (!res.ok) { setError(body.error || "התבנית לא נמצאה"); return; }
      setTemplate(body.template);
      setName(body.template.name);
      setFields(body.template.fields.map((field: Field) => ({ ...field, source: "template", proposed: false })));
    })();
    return () => { cancel = true; };
  }, [id]);

  const save = async () => {
    if (!name.trim()) { setError("תנו שם לתבנית"); return; }
    setBusy(true);
    setError(null);
    try {
      const clean: Field[] = fields.map(({ source: _s, proposed: _p, ...field }) => field);
      const res = await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), fields: clean }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || "השמירה נכשלה"); return; }
      router.push("/templates");
    } catch {
      setError("השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  if (error && !template) return <Banner tone="error">{error}</Banner>;
  if (!template) return <p role="status">טוען…</p>;
  const current = template.pages[page];
  if (!current) return <Banner tone="error">אין תמונה בתבנית</Banner>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">עריכת תבנית</h1>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {template.pages.length > 1 ? (
          <div className="flex gap-2">{template.pages.map((_, index) => <Button key={index} variant={index === page ? "primary" : "quiet"} onClick={() => setPage(index)}>עמוד {index + 1}</Button>)}</div>
        ) : null}
        <FieldStage
          src={`/api/file?url=${encodeURIComponent(current.path)}`}
          page={page}
          fields={fields}
          mode={mode}
          selectedId={selected}
          onSelect={setSelected}
          onChange={setFields}
        />
      </div>
      <div className="space-y-3">
        <TextField label="שם התבנית">
          <input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} />
        </TextField>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={mode === "select" ? "primary" : "quiet"} onClick={() => setMode("select")}>הזזה</Button>
          <Button variant={mode === "marker" ? "primary" : "quiet"} onClick={() => setMode("marker")}>סימון</Button>
          {(["signature", "name", "id", "date"] as FieldKind[]).map((kind) => (
            <Button key={kind} variant={mode === kind ? "primary" : "quiet"} onClick={() => setMode(kind)}>הוספת {KIND_LABEL[kind]}</Button>
          ))}
        </div>
        <Button variant="accent" onClick={save} disabled={busy}>{busy ? "שומרים…" : "שמירת שינויים"}</Button>
        <Link className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-4 font-medium" href={`/new?template=${id}`}>שליחה לחייל</Link>
        <Button variant="danger" onClick={async () => {
          await fetch(`/api/templates/${id}`, { method: "DELETE" });
          router.push("/templates");
        }}>מחיקת התבנית</Button>
      </div>
    </div>
  );
}
