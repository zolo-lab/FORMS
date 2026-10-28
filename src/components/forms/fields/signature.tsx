"use client";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { fitFontSize, initialsOf } from "@/lib/pdf/typed-signature";
import type { FieldProps } from "./types";

function SignatureCanvas({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    // Ink colour is data (burned into the PNG that is stamped on the PDF), not a theme token.
    const pad = new SignaturePad(canvas, { penColor: "rgb(0,0,0)", minWidth: 0.8, maxWidth: 2.4 });
    pad.addEventListener("endStroke", () => setEmpty(pad.isEmpty()));
    padRef.current = pad;
    // The <dialog> is laid out after this effect runs, so size the bitmap whenever the box changes.
    const resize = () => {
      if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")!.scale(ratio, ratio);
      pad.clear();
      setEmpty(true);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => {
      ro.disconnect();
      pad.off();
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-3">
      <canvas
        ref={canvasRef}
        aria-label="אזור חתימה"
        className="min-h-48 w-full flex-1 touch-none rounded-md border bg-card"
      />
      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={() => { padRef.current?.clear(); setEmpty(true); }}>נקה</Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>ביטול</Button>
          <Button disabled={empty} onClick={() => onSave(padRef.current!.toDataURL("image/png"))}>שמירת חתימה</Button>
        </div>
      </div>
    </div>
  );
}

/** Renders the typed name (or its initials) with the handwriting font onto a transparent PNG. */
async function renderTyped(text: string): Promise<string> {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-signature").trim() || "cursive";
  await document.fonts.load(`64px ${family}`, text).catch(() => []);
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 240;
  const ctx = canvas.getContext("2d")!;
  const measure = (size: number, t: string) => {
    ctx.font = `${size}px ${family}`;
    return ctx.measureText(t).width;
  };
  const size = fitFontSize(text, canvas.width - 40, 140, measure);
  ctx.font = `${size}px ${family}`;
  ctx.fillStyle = "rgb(0,0,0)"; // ink colour is burned into the PNG, not a theme token
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "rtl";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

function TypedSignature({ onSave, onCancel }: { onSave: (dataUrl: string, text: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [initials, setInitials] = useState(false);
  const [rendered, setRendered] = useState<{ text: string; url: string } | null>(null);
  const text = initials ? initialsOf(name) : name.trim();
  // Only show a preview that belongs to the current text.
  const preview = text && rendered?.text === text ? rendered.url : null;

  useEffect(() => {
    let alive = true;
    if (!text) return;
    renderTyped(text).then((url) => { if (alive) setRendered({ text, url }); });
    return () => { alive = false; };
  }, [text]);

  return (
    <div className="flex flex-1 flex-col gap-3">
      <label className="space-y-1 text-sm">
        <span>שם מלא</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="הקלידו את שמכם" autoComplete="name" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-primary" checked={initials} onChange={(e) => setInitials(e.target.checked)} />
        ראשי תיבות בלבד
      </label>
      <div className="flex min-h-40 flex-1 items-center justify-center rounded-md border bg-card p-2" aria-label="תצוגה מקדימה של החתימה">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL preview
          <img src={preview} alt={`חתימה: ${text}`} className="max-h-40" />
        ) : (
          <span className="text-sm text-muted-foreground">החתימה תופיע כאן</span>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>ביטול</Button>
        <Button disabled={!preview} onClick={() => onSave(preview!, text)}>שמירת חתימה</Button>
      </div>
    </div>
  );
}

export type SignatureValue = { image: string; kind: "drawn" | "typed" | "uploaded"; text?: string; signedAt: string };

/** A picture of a stamp, scaled down to a PNG of at most 600px (the same format a drawn signature is stored in). */
async function imageFileToPng(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function StampUpload({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-1 flex-col gap-3">
      <label className="space-y-1 text-sm">
        <span>תמונה של החותמת (PNG או JPG)</span>
        <Input
          type="file"
          accept="image/png,image/jpeg"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setError(null);
            try { setPreview(await imageFileToPng(f)); } catch { setError("לא הצלחנו לקרוא את התמונה. נסו קובץ PNG או JPG אחר."); }
          }}
        />
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex min-h-40 flex-1 items-center justify-center rounded-md border bg-card p-2" aria-label="תצוגה מקדימה של החותמת">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL preview
          <img src={preview} alt="החותמת" className="max-h-40" />
        ) : (
          <span className="text-sm text-muted-foreground">החותמת תופיע כאן</span>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>ביטול</Button>
        <Button disabled={!preview} onClick={() => onSave(preview!)}>שמירת חותמת</Button>
      </div>
    </div>
  );
}

/** Draw-or-type chooser (the body of the signature dialog). Used by the form field and by "fill on the document". */
export function SignaturePicker({ onCancel, onSave, stamp = false }: { onCancel: () => void; onSave: (v: SignatureValue) => void; stamp?: boolean }) {
  const [mode, setMode] = useState<"draw" | "type" | "upload">(stamp ? "upload" : "draw");
  const tabs = stamp
    ? [{ id: "upload" as const, label: "העלאת תמונה" }, { id: "draw" as const, label: "חתימה ביד" }]
    : [{ id: "draw" as const, label: "ציור" }, { id: "type" as const, label: "הקלדה" }];
  return (
    <div className="flex flex-1 flex-col gap-3">
      <Tabs tabs={tabs} value={mode} onChange={setMode} />
      {mode === "upload" ? (
        <StampUpload onCancel={onCancel} onSave={(dataUrl) => onSave({ image: dataUrl, kind: "uploaded", signedAt: new Date().toISOString() })} />
      ) : mode === "draw" ? (
        <SignatureCanvas onCancel={onCancel} onSave={(dataUrl) => onSave({ image: dataUrl, kind: "drawn", signedAt: new Date().toISOString() })} />
      ) : (
        <TypedSignature onCancel={onCancel} onSave={(dataUrl, text) => onSave({ image: dataUrl, kind: "typed", text, signedAt: new Date().toISOString() })} />
      )}
    </div>
  );
}

export function SignatureInput({ domId, value, onChange, disabled, stamp = false }: FieldProps & { stamp?: boolean }) {
  const noun = stamp ? "חותמת" : "חתימה";
  const [open, setOpen] = useState(false);
  const image = (value as { image?: string } | null | undefined)?.image;
  return (
    <div id={domId}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL signature preview
        <img src={image} alt={stamp ? "החותמת" : "החתימה שלך"} className="h-24 rounded-md border bg-card p-1" />
      ) : (
        <p className="text-sm text-muted-foreground">{stamp ? "טרם נוספה חותמת" : "טרם נחתם"}</p>
      )}
      {!disabled && (
        <div className="mt-2 flex gap-2">
          <Button variant="outline" onClick={() => setOpen(true)}>{image ? `${noun} מחדש` : stamp ? "הוספת חותמת" : "חתימה"}</Button>
          {image && <Button variant="ghost" onClick={() => onChange(undefined)}>מחיקה</Button>}
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={noun} fullScreenOnMobile className="sm:w-[min(92vw,40rem)]">
        <SignaturePicker stamp={stamp} onCancel={() => setOpen(false)} onSave={(v) => { onChange(v); setOpen(false); }} />
      </Dialog>
    </div>
  );
}
