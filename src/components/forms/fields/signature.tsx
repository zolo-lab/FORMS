"use client";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { FieldProps } from "./types";

function SignatureCanvas({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")!.scale(ratio, ratio);
    // Ink colour is data (burned into the PNG that is stamped on the PDF), not a theme token.
    const pad = new SignaturePad(canvas, { penColor: "rgb(0,0,0)", minWidth: 0.8, maxWidth: 2.4 });
    pad.addEventListener("endStroke", () => setEmpty(pad.isEmpty()));
    padRef.current = pad;
    return () => pad.off();
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

export function SignatureInput({ domId, value, onChange, disabled }: FieldProps) {
  const [open, setOpen] = useState(false);
  const image = (value as { image?: string } | null | undefined)?.image;
  return (
    <div id={domId}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL signature preview
        <img src={image} alt="החתימה שלך" className="h-24 rounded-md border bg-card p-1" />
      ) : (
        <p className="text-sm text-muted-foreground">טרם נחתם</p>
      )}
      {!disabled && (
        <div className="mt-2 flex gap-2">
          <Button variant="outline" onClick={() => setOpen(true)}>{image ? "חתימה מחדש" : "חתימה"}</Button>
          {image && <Button variant="ghost" onClick={() => onChange(undefined)}>מחיקה</Button>}
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="חתימה" fullScreenOnMobile className="sm:w-[min(92vw,40rem)]">
        <SignatureCanvas
          onCancel={() => setOpen(false)}
          onSave={(dataUrl) => { onChange({ image: dataUrl, signedAt: new Date().toISOString() }); setOpen(false); }}
        />
      </Dialog>
    </div>
  );
}
