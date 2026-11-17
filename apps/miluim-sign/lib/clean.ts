import type { Field, FieldKind, PageRef } from "./types";
import { KIND_LABEL } from "./types";
import { isBlobUrl } from "./storage";

const KINDS = new Set<FieldKind>(["name", "id", "signature", "date"]);

export function cleanFields(value: unknown): Field[] | null {
  if (!Array.isArray(value)) return null;
  const out: Field[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const f = raw as Partial<Field>;
    if (typeof f.id !== "string" || !f.id || f.id.length > 80) return null;
    if (!KINDS.has(f.kind as FieldKind)) return null;
    const kind = f.kind as FieldKind;
    const nums = [f.x, f.y, f.w, f.h];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)) return null;
    if ((f.w ?? 0) < 0.02 || (f.h ?? 0) < 0.015) return null;
    const page = Number(f.page);
    if (!Number.isInteger(page) || page < 0 || page > 12) return null;
    out.push({
      id: f.id,
      page,
      kind,
      x: f.x as number,
      y: f.y as number,
      w: f.w as number,
      h: f.h as number,
      label: typeof f.label === "string" && f.label.trim() ? f.label.trim().slice(0, 40) : KIND_LABEL[kind],
    });
  }
  return out;
}

export function cleanPages(value: unknown): PageRef[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;
  const out: PageRef[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Partial<PageRef>;
    if (typeof p.path !== "string" || !isBlobUrl(p.path)) return null;
    if (typeof p.width !== "number" || typeof p.height !== "number") return null;
    if (p.width < 20 || p.height < 20 || p.width > 8000 || p.height > 8000) return null;
    out.push({ path: p.path, width: Math.round(p.width), height: Math.round(p.height) });
  }
  return out;
}
