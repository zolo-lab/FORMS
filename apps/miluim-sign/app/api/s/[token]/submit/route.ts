import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getByToken, markSigned } from "@/lib/db";
import { normalizeIsraeliId } from "@/lib/id";
import { notifySigned } from "@/lib/notify";
import { imagesToPdf } from "@/lib/pdf-pack";
import { stampPage } from "@/lib/stamp";
import { readBytes, putBytes } from "@/lib/storage";
import type { Field } from "@/lib/types";

export const dynamic = "force-dynamic";

function pngFromDataUrl(value: unknown): Uint8Array | null {
  if (typeof value !== "string") return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match?.[1]) return null;
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length < 24 || bytes.length > 500_000 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  if (bytes.subarray(12, 16).toString() !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0 || width > 2000 || height > 2000) return null;
  return new Uint8Array(bytes);
}

function asAnswers(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") return null;
    out[key] = item;
  }
  return out;
}

function check(fields: Field[], answers: Record<string, string>, signatures: Record<string, Uint8Array>): string | null {
  for (const field of fields) {
    if (field.kind === "signature") {
      if (!signatures[field.id]) return "חסרה חתימה";
      continue;
    }
    const value = (answers[field.id] ?? "").trim();
    if (field.kind === "name" && !value) return "חסר שם";
    if (field.kind === "id") {
      const id = normalizeIsraeliId(value);
      if (!id) return "מספר הזהות אינו תקין";
      answers[field.id] = id;
    }
    if (field.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "חסר תאריך";
  }
  return null;
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const doc = await getByToken(token);
  if (!doc) return NextResponse.json({ error: "הקישור אינו תקף" }, { status: 404 });
  if (doc.status === "signed") return NextResponse.json({ error: "הטופס כבר נחתם", signedAt: doc.signedAt }, { status: 409 });
  const body = await req.json().catch(() => null) as { answers?: unknown; signatures?: unknown } | null;
  const answers = asAnswers(body?.answers);
  const rawSignatures = body?.signatures && typeof body.signatures === "object" ? body.signatures as Record<string, unknown> : null;
  if (!answers || !rawSignatures) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  const signatures: Record<string, Uint8Array> = {};
  for (const field of doc.fields) {
    if (field.kind !== "signature") continue;
    const png = pngFromDataUrl(rawSignatures[field.id]);
    if (!png) return NextResponse.json({ error: "חסרה חתימה" }, { status: 422 });
    signatures[field.id] = png;
  }
  const problem = check(doc.fields, answers, signatures);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });
  const images: Uint8Array[] = [];
  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    if (!page) return NextResponse.json({ error: "עמוד המקור חסר" }, { status: 500 });
    const original = await readBytes(page.path);
    if (!original) return NextResponse.json({ error: "עמוד המקור חסר" }, { status: 500 });
    const fields = doc.fields.filter((field) => field.page === i);
    images.push(await stampPage(original.bytes, fields, answers, signatures));
  }
  const pdf = await imagesToPdf(images);
  const hash = createHash("sha256").update(pdf).digest("hex");
  const pdfPath = await putBytes(pdf, "application/pdf");
  const imagePath = await putBytes(images[0]!, "image/jpeg");
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim().slice(0, 64) || "unknown";
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 300);
  const saved = await markSigned(token, { answers, ip, ua, hash, pdfPath, imagePath });
  if (!saved) return NextResponse.json({ error: "הטופס כבר נחתם" }, { status: 409 });
  try { await notifySigned(doc.signerName, doc.id); } catch { /* a missed push still leaves the dashboard */ }
  return NextResponse.json({ ok: true, hash });
}
