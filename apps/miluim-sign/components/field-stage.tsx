"use client";

import { useEffect, useRef, useState } from "react";
import { KIND_LABEL, KIND_SIZE, makeField, type EditorField, type FieldKind } from "@/lib/types";
import { maskBoxes } from "@/lib/vision";

export type StageMode = "select" | "marker" | FieldKind;

const tone: Record<FieldKind, string> = {
  signature: "border-primary bg-primary/15",
  name: "border-warning bg-warning/20",
  id: "border-destructive/80 bg-destructive/10",
  date: "border-success bg-success/15",
};

type Drag =
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "resize"; id: string; handle: "nw" | "ne" | "sw" | "se"; field: EditorField }
  | { kind: "draw"; x0: number; y0: number; x1: number; y1: number };

export function FieldStage({
  src,
  page,
  fields,
  mode,
  selectedId,
  onSelect,
  onChange,
}: {
  src: string;
  page: number;
  fields: EditorField[];
  mode: StageMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (fields: EditorField[]) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame || mode !== "marker") return;
    const fit = () => {
      canvas.width = frame.clientWidth;
      canvas.height = frame.clientHeight;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [mode, src]);

  const point = (event: React.PointerEvent) => {
    const rect = frameRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
      rect,
    };
  };

  const hitHandle = (x: number, y: number, field: EditorField, rect: DOMRect) => {
    const handles = {
      nw: [field.x, field.y],
      ne: [field.x + field.w, field.y],
      sw: [field.x, field.y + field.h],
      se: [field.x + field.w, field.y + field.h],
    } as const;
    for (const [name, pos] of Object.entries(handles) as ["nw" | "ne" | "sw" | "se", readonly [number, number]][]) {
      const dx = (x - pos[0]) * rect.width;
      const dy = (y - pos[1]) * rect.height;
      if (dx * dx + dy * dy < 32 * 32) return name;
    }
    return null;
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!frameRef.current) return;
    const { x, y, rect } = point(event);
    if (mode === "marker") {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      drawing.current = true;
      ctx.strokeStyle = "rgba(30, 58, 95, 0.9)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x * rect.width, y * rect.height);
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    const pageFields = fields.filter((field) => field.page === page);
    const selected = pageFields.find((field) => field.id === selectedId);
    if (mode === "select" && selected) {
      const handle = hitHandle(x, y, selected, rect);
      if (handle) {
        setDrag({ kind: "resize", id: selected.id, handle, field: selected });
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }
    const hit = [...pageFields].reverse().find((field) => x >= field.x && x <= field.x + field.w && y >= field.y && y <= field.y + field.h);
    if (mode === "select") {
      onSelect(hit?.id ?? null);
      if (hit) {
        setDrag({ kind: "move", id: hit.id, dx: x - hit.x, dy: y - hit.y });
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    setDrag({ kind: "draw", x0: x, y0: y, x1: x, y1: y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (mode === "marker" && drawing.current && canvasRef.current) {
      const rect = frameRef.current!.getBoundingClientRect();
      const ctx = canvasRef.current.getContext("2d");
      ctx?.lineTo(event.clientX - rect.left, event.clientY - rect.top);
      ctx?.stroke();
      return;
    }
    if (!drag || !frameRef.current) return;
    const { x, y } = point(event);
    if (drag.kind === "draw") {
      setDrag({ ...drag, x1: x, y1: y });
      return;
    }
    onChange(fields.map((field) => {
      if (field.id !== drag.id) return field;
      if (drag.kind === "move") {
        const nx = Math.min(Math.max(0, x - drag.dx), 1 - field.w);
        const ny = Math.min(Math.max(0, y - drag.dy), 1 - field.h);
        return { ...field, x: nx, y: ny, proposed: false };
      }
      let { x: fx, y: fy, w, h } = drag.field;
      const minW = 0.04;
      const minH = 0.025;
      if (drag.handle.includes("e")) w = Math.max(minW, x - fx);
      if (drag.handle.includes("s")) h = Math.max(minH, y - fy);
      if (drag.handle.includes("w")) {
        const right = fx + w;
        fx = Math.min(x, right - minW);
        w = right - fx;
      }
      if (drag.handle.includes("n")) {
        const bottom = fy + h;
        fy = Math.min(y, bottom - minH);
        h = bottom - fy;
      }
      fx = Math.max(0, fx);
      fy = Math.max(0, fy);
      w = Math.min(w, 1 - fx);
      h = Math.min(h, 1 - fy);
      return { ...field, x: fx, y: fy, w, h, proposed: false };
    }));
  };

  const onPointerUp = () => {
    drawing.current = false;
    if (!drag) return;
    if (drag.kind === "draw" && (mode === "name" || mode === "id" || mode === "signature" || mode === "date")) {
      const w = Math.abs(drag.x1 - drag.x0);
      const h = Math.abs(drag.y1 - drag.y0);
      const size = KIND_SIZE[mode];
      const field = w < 0.03 && h < 0.02
        ? makeField(mode, page, drag.x0 - size.w / 2, drag.y0 - size.h / 2)
        : makeField(mode, page, Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), w, h);
      onChange([...fields, field]);
      onSelect(field.id);
    }
    setDrag(null);
  };

  const commitMarker = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mask = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < mask.length; i++) if ((image.data[i * 4 + 3] ?? 0) > 40) mask[i] = 1;
    const boxes = maskBoxes(mask, canvas.width, canvas.height, 24);
    const added = boxes.map((box) => makeField("signature", page, box.x, box.y, Math.max(box.w, 0.08), Math.max(box.h, 0.03), "marker"));
    if (added.length) {
      onChange([...fields, ...added]);
      onSelect(added[0]!.id);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const preview = drag?.kind === "draw"
    ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }
    : null;

  return (
    <div className="space-y-3">
      <div
        ref={frameRef}
        dir="ltr"
        className="relative touch-none overflow-hidden rounded-lg border border-border bg-white"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* The form photo is a coordinate space. Physical left/top match the picture, so this stage stays LTR. */}
        <img src={src} alt="הטופס לסימון שדות" className="block h-auto w-full select-none" draggable={false} />
        {fields.filter((field) => field.page === page).map((field, index) => (
          <div
            key={field.id}
            className={`absolute border-2 ${tone[field.kind]} ${field.proposed ? "border-dashed" : ""} ${field.id === selectedId ? "ring-2 ring-ring" : ""}`}
            style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.w * 100}%`, height: `${field.h * 100}%` }}
          >
            <span className="absolute -top-5 start-0 rounded bg-card px-1 text-[11px] font-medium text-foreground">{index + 1}. {KIND_LABEL[field.kind]}</span>
            {field.id === selectedId && mode === "select" ? (["nw", "ne", "sw", "se"] as const).map((handle) => (
              <span
                key={handle}
                className="absolute size-4 rounded-full border-2 border-primary bg-card"
                style={{
                  left: handle.includes("w") ? -8 : undefined,
                  right: handle.includes("e") ? -8 : undefined,
                  top: handle.includes("n") ? -8 : undefined,
                  bottom: handle.includes("s") ? -8 : undefined,
                }}
              />
            )) : null}
          </div>
        ))}
        {preview && preview.w > 0.005 ? (
          <div className="absolute border-2 border-primary bg-primary/10" style={{ left: `${preview.x * 100}%`, top: `${preview.y * 100}%`, width: `${preview.w * 100}%`, height: `${preview.h * 100}%` }} />
        ) : null}
        <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full ${mode === "marker" ? "" : "pointer-events-none"}`} />
      </div>
      {mode === "marker" ? (
        <button type="button" onClick={commitMarker} className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground">
          הפיכת הסימון לשדות חתימה
        </button>
      ) : null}
    </div>
  );
}
