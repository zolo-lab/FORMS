"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { burnPage } from "@/lib/burn";
import { isValidIsraeliId } from "@/lib/id";
import { formatWhen, todayIL, type Field, type FieldKind } from "@/lib/types";
import { Banner, Button, TextField, controlClass } from "@/components/ui";

interface SignPayload {
  status: string;
  title: string;
  signerName: string;
  oneSignature?: boolean;
  prefill?: { name?: string; idNumber?: string; date?: string };
  fields?: Field[];
  pages?: { width: number; height: number; url: string }[];
  signedAt?: string | null;
  imageUrl?: string;
  error?: string;
}

const order = (fields: Field[]) => [...fields].sort((a, b) => a.page - b.page || a.y - b.y || b.x - a.x);

export function SignerClient({ token }: { token: string }) {
  const [data, setData] = useState<SignPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sigs, setSigs] = useState<Record<string, string>>({});
  const [one, setOne] = useState(true);
  const [shared, setShared] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const res = await fetch(`/api/s/${token}`);
      const body = await res.json().catch(() => ({}));
      if (cancel) return;
      if (!res.ok) { setError(body.error || "הקישור אינו תקף"); return; }
      setData(body);
      if (body.status !== "signed") {
        await fetch(`/api/s/${token}/open`, { method: "POST" });
        const initial: Record<string, string> = {};
        let named = false;
        let identified = false;
        for (const field of body.fields ?? []) {
          if (field.kind === "date") initial[field.id] = body.prefill?.date || todayIL();
          if (field.kind === "name" && body.prefill?.name && !named) { initial[field.id] = body.prefill.name; named = true; }
          if (field.kind === "id" && body.prefill?.idNumber && !identified) { initial[field.id] = body.prefill.idNumber; identified = true; }
        }
        setValues(initial);
        setOne(body.oneSignature !== false);
      }
    })();
    return () => { cancel = true; };
  }, [token]);

  const fields = data?.fields ?? [];
  const pages = data?.pages ?? [];
  const signatureFor = (field: Field) => (one ? shared : sigs[field.id]) ?? "";
  const missing = useMemo(() => order(fields).find((field) => {
    if (field.kind === "signature") return !signatureFor(field);
    if (field.kind === "id") return !isValidIsraeliId(values[field.id] ?? "");
    return !(values[field.id] ?? "").trim();
  }), [fields, values, sigs, shared, one]);

  const focusField = (id: string) => {
    setActive(id);
    document.getElementById(`f-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  };

  const submit = async () => {
    if (!data?.pages || missing) { setError(missing ? "עוד יש שדות למילוי" : "אין טופס"); return; }
    setBusy(true);
    setError(null);
    try {
      const signatureMap: Record<string, string> = {};
      for (const field of fields) if (field.kind === "signature") signatureMap[field.id] = signatureFor(field);
      const blobs: Blob[] = [];
      for (let i = 0; i < data.pages.length; i++) {
        const page = data.pages[i]!;
        blobs.push(await burnPage(page.url, fields.filter((field) => field.page === i), values, signatureMap));
      }
      setPreview(URL.createObjectURL(blobs[0]!));
      const form = new FormData();
      form.set("answers", JSON.stringify(values));
      form.set("covered", JSON.stringify(fields.filter((field) => field.kind === "signature").map((field) => field.id)));
      blobs.forEach((blob, index) => form.set(`page-${index}`, blob, `page-${index}.jpg`));
      const res = await fetch(`/api/s/${token}/submit`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "השמירה נכשלה");
      setDone(new Date().toISOString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "השמירה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <main className="mx-auto max-w-lg px-4 py-10"><Banner tone="error">{error}</Banner></main>;
  if (!data) return <main className="mx-auto max-w-lg px-4 py-10"><p role="status">טוען את הטופס…</p></main>;
  if (data.status === "signed" || done) {
    return (
      <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">החתימה נשמרה</h1>
        <p>תודה{data.signerName ? ` ${data.signerName}` : ""}. הזמן שנרשם: {formatWhen(done || data.signedAt || null)}.</p>
        {preview || data.imageUrl ? <img src={preview || data.imageUrl} alt="הטופס החתום" className="w-full rounded-lg border border-border" /> : null}
      </main>
    );
  }

  const activeField = fields.find((field) => field.id === active) ?? null;
  return (
    <main className="pb-28">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">{data.title}</h1>
        <p className="text-sm text-muted-foreground">{data.signerName ? `${data.signerName} · ` : ""}נשארו {order(fields).filter((field) => field.kind === "signature" ? !signatureFor(field) : !(values[field.id] ?? "").trim()).length} שדות</p>
      </header>
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {error ? <Banner tone="error">{error}</Banner> : null}
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5" checked={one} onChange={(event) => setOne(event.target.checked)} />
          חתימה אחת לכל המקומות
        </label>
        <div className="flex gap-2">
          <Button variant="quiet" onClick={() => setScale((value) => Math.max(1, value - 0.5))}>הקטנה</Button>
          <Button variant="quiet" onClick={() => setScale((value) => Math.min(3, value + 0.5))}>הגדלה</Button>
        </div>
        <div className="overflow-auto rounded-lg border border-border bg-muted">
          <div style={{ width: `${scale * 100}%` }} className="space-y-4 p-2">
            {pages.map((page, index) => (
              <div key={page.url} className="relative" dir="ltr">
                <img src={page.url} alt={`עמוד ${index + 1}`} className="block h-auto w-full" />
                {fields.filter((field) => field.page === index).map((field) => (
                  <button
                    key={field.id}
                    id={`f-${field.id}`}
                    type="button"
                    className={`absolute cursor-pointer border-2 ${signatureFor(field) || (field.kind !== "signature" && values[field.id]) ? "border-success bg-success/10" : "border-primary bg-primary/10"}`}
                    style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.w * 100}%`, height: `${field.h * 100}%` }}
                    onClick={() => focusField(field.id)}
                  >
                    <span className="sr-only">{labelOf(field.kind)}</span>
                    {field.kind === "signature" && signatureFor(field) ? <img src={signatureFor(field)} alt="" className="h-full w-full object-contain" /> : null}
                    {field.kind !== "signature" && values[field.id] ? <span className={`block truncate px-1 text-[10px] ${field.kind === "name" ? "" : "text-center"}`} dir={field.kind === "name" ? "auto" : "ltr"}>{field.kind === "date" ? values[field.id]!.split("-").reverse().join("/") : values[field.id]}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-4 py-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button className="flex-1" variant="quiet" onClick={() => missing && focusField(missing.id)}>השדה הבא</Button>
          <Button className="flex-1" variant="accent" onClick={submit} disabled={busy || !!missing}>{busy ? "שולחים…" : "שליחת החתימה"}</Button>
        </div>
      </div>
      {activeField ? (
        <FieldSheet
          field={activeField}
          value={activeField.kind === "signature" ? signatureFor(activeField) : (values[activeField.id] ?? "")}
          onClose={() => setActive(null)}
          onSave={(value) => {
            if (activeField.kind === "signature") {
              if (one) setShared(value);
              else setSigs((current) => ({ ...current, [activeField.id]: value }));
            } else setValues((current) => ({ ...current, [activeField.id]: value }));
            setActive(null);
          }}
        />
      ) : null}
      <noscript><p>צריך להפעיל JavaScript כדי לחתום.</p></noscript>
    </main>
  );
}

function labelOf(kind: FieldKind) {
  return kind === "name" ? "שם" : kind === "id" ? "תעודת זהות" : kind === "date" ? "תאריך" : "חתימה";
}

function FieldSheet({ field, value, onClose, onSave }: { field: Field; value: string; onClose: () => void; onSave: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [text, setText] = useState(value);
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => {
    if (field.kind !== "signature") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const timer = window.setTimeout(() => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const width = canvas.offsetWidth || 320;
      const height = canvas.offsetHeight || 192;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
      padRef.current?.off();
      padRef.current = new SignaturePad(canvas, { minWidth: 1.1, maxWidth: 2.6, penColor: "#1e3a5f" });
    }, 40);
    return () => {
      window.clearTimeout(timer);
      padRef.current?.off();
    };
  }, [field.kind, field.id]);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-foreground/40 sm:items-center" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={labelOf(field.kind)} className="w-full max-w-lg space-y-3 rounded-t-lg bg-card p-4 sm:rounded-lg">
        <h2 className="text-lg font-semibold">{labelOf(field.kind)}</h2>
        {field.kind === "signature" ? (
          <div dir="ltr">
            <canvas ref={canvasRef} className="h-48 w-full rounded-lg border border-border bg-white" aria-label="אזור חתימה" />
            <div className="mt-2 flex gap-2">
              <Button variant="quiet" onClick={() => padRef.current?.clear()}>ניקוי</Button>
              <Button variant="accent" onClick={() => {
                if (!padRef.current || padRef.current.isEmpty()) { setLocalError("חתמו בתוך המסגרת"); return; }
                onSave(padRef.current.toDataURL("image/png"));
              }}>שמירת החתימה</Button>
            </div>
          </div>
        ) : (
          <TextField label={labelOf(field.kind)} error={localError ?? undefined}>
            <input
              className={controlClass}
              dir={field.kind === "name" ? "auto" : "ltr"}
              inputMode={field.kind === "id" ? "numeric" : undefined}
              type={field.kind === "date" ? "date" : "text"}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </TextField>
        )}
        {field.kind !== "signature" ? (
          <Button variant="accent" onClick={() => {
            if (field.kind === "id" && !isValidIsraeliId(text)) { setLocalError("מספר הזהות אינו תקין"); return; }
            if (!text.trim()) { setLocalError("צריך למלא את השדה"); return; }
            onSave(field.kind === "id" ? text.replace(/[^\d]/g, "").padStart(9, "0") : text.trim());
          }}>שמירה</Button>
        ) : null}
        {localError && field.kind === "signature" ? <p role="alert" className="text-sm text-destructive">{localError}</p> : null}
        <Button variant="ghost" onClick={onClose}>סגירה</Button>
      </div>
    </div>
  );
}
