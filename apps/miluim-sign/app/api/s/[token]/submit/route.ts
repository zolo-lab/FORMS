import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getByToken, markSigned } from "@/lib/db";
import { normalizeIsraeliId } from "@/lib/id";
import { notifySigned } from "@/lib/notify";
import { imagesToPdf } from "@/lib/pdf-pack";
import { putBytes } from "@/lib/storage";
import type { Field } from "@/lib/types";

export const dynamic = "force-dynamic";

function check(fields: Field[], answers: Record<string, string>, covered: string[]): string | null {
  const have = new Set(covered);
  for (const field of fields) {
    if (field.kind === "signature") {
      if (!have.has(field.id)) return "חסרה חתימה";
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
  const form = await req.formData();
  const answers = JSON.parse(typeof form.get("answers") === "string" ? form.get("answers") as string : "{}") as Record<string, string>;
  const covered = JSON.parse(typeof form.get("covered") === "string" ? form.get("covered") as string : "[]") as string[];
  if (!answers || typeof answers !== "object" || !Array.isArray(covered)) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  const problem = check(doc.fields, answers, covered);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });
  const images: Uint8Array[] = [];
  for (let i = 0; i < doc.pages.length; i++) {
    const file = form.get(`page-${i}`);
    if (!(file instanceof File) || file.size < 1000 || file.size > 8_000_000) return NextResponse.json({ error: "התמונה החתומה חסרה" }, { status: 400 });
    images.push(new Uint8Array(await file.arrayBuffer()));
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
