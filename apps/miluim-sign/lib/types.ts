export type FieldKind = "name" | "id" | "signature" | "date";

export interface Field {
  id: string;
  page: number;
  kind: FieldKind;
  /** Relative to the page image, origin top-left, 0–1. */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface EditorField extends Field {
  source: "auto" | "marker" | "manual" | "template";
  proposed: boolean;
}

export interface PageRef {
  path: string;
  width: number;
  height: number;
}

export interface DetectedField {
  kind: FieldKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  score: number;
}

export interface RecipientInput {
  name: string;
  phone: string;
  idNumber: string;
}

export type DocStatus = "sent" | "opened" | "signed";

export interface TemplateRow {
  id: string;
  name: string;
  pages: PageRef[];
  fields: Field[];
  thumbPath: string | null;
  createdAt: string;
  updatedAt: string;
  /** Exact `updated_at` text from the database, sent back on save. */
  version: string;
}

export interface DocumentRow {
  id: string;
  templateId: string | null;
  title: string;
  pages: PageRef[];
  fields: Field[];
  signerName: string;
  signerPhone: string;
  oneSignature: boolean;
  token: string;
  status: DocStatus;
  prefill: { name?: string; idNumber?: string; date?: string };
  answers: Record<string, string> | null;
  sentAt: string | null;
  openedAt: string | null;
  signedAt: string | null;
  signerIp: string | null;
  signerUa: string | null;
  fileHash: string | null;
  signedPdfPath: string | null;
  signedImagePath: string | null;
  seen: boolean;
  createdAt: string;
}

export const KIND_LABEL: Record<FieldKind, string> = {
  name: "שם",
  id: "ת\"ז",
  signature: "חתימה",
  date: "תאריך",
};

export const KIND_SIZE: Record<FieldKind, { w: number; h: number }> = {
  name: { w: 0.3, h: 0.042 },
  id: { w: 0.24, h: 0.042 },
  signature: { w: 0.18, h: 0.05 },
  date: { w: 0.16, h: 0.042 },
};

export function newId(): string {
  return crypto.randomUUID();
}

export function makeField(
  kind: FieldKind,
  page: number,
  x: number,
  y: number,
  w?: number,
  h?: number,
  source: EditorField["source"] = "manual",
  proposed = false,
): EditorField {
  const size = KIND_SIZE[kind];
  const fw = clamp(w ?? size.w, 0.03, 0.9);
  const fh = clamp(h ?? size.h, 0.02, 0.4);
  const fx = clamp(x, 0, 1 - fw);
  const fy = clamp(y, 0, 1 - fh);
  return { id: newId(), page, kind, x: fx, y: fy, w: fw, h: fh, label: KIND_LABEL[kind], source, proposed };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function todayIL(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
