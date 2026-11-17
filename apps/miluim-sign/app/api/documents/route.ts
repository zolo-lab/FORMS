import { NextResponse } from "next/server";
import { newSigningToken } from "@/lib/auth";
import { cleanFields, cleanPages } from "@/lib/clean";
import { insertDocuments, listDocuments } from "@/lib/db";
import { normalizeIsraeliId, isValidIsraeliId } from "@/lib/id";
import { toWaDigits } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function GET() {
  const documents = await listDocuments();
  return NextResponse.json({ documents });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    title?: unknown;
    pages?: unknown;
    fields?: unknown;
    recipients?: unknown;
    oneSignature?: unknown;
    templateId?: unknown;
    date?: unknown;
  } | null;
  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : "כתב הסכמה";
  const pages = cleanPages(body?.pages);
  const fields = cleanFields(body?.fields);
  if (!pages || !fields) return NextResponse.json({ error: "הטופס אינו שלם" }, { status: 400 });
  if (!fields.some((field) => field.kind === "signature")) return NextResponse.json({ error: "צריך לפחות שדה חתימה אחד" }, { status: 400 });
  if (!Array.isArray(body?.recipients) || body.recipients.length === 0) return NextResponse.json({ error: "חסר נמען" }, { status: 400 });
  if (body.recipients.length > 40) return NextResponse.json({ error: "אפשר לשלוח עד 40 חיילים בבת אחת" }, { status: 400 });
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : undefined;
  const rows = [];
  const created = [];
  for (const raw of body.recipients) {
    const item = raw as { name?: unknown; phone?: unknown; idNumber?: unknown };
    const name = typeof item?.name === "string" ? item.name.trim().slice(0, 80) : "";
    const phone = typeof item?.phone === "string" ? item.phone.trim() : "";
    const idNumber = typeof item?.idNumber === "string" ? item.idNumber.trim() : "";
    if (!toWaDigits(phone)) return NextResponse.json({ error: name ? `טלפון לא תקין: ${name}` : "טלפון לא תקין" }, { status: 400 });
    if (idNumber && !isValidIsraeliId(idNumber)) return NextResponse.json({ error: name ? `ת"ז לא תקינה: ${name}` : "ת\"ז לא תקינה" }, { status: 400 });
    const id = crypto.randomUUID();
    const token = newSigningToken();
    rows.push({
      id,
      templateId: typeof body.templateId === "string" ? body.templateId : null,
      title,
      pages,
      fields,
      signerName: name,
      signerPhone: phone,
      oneSignature: body.oneSignature !== false,
      token,
      prefill: {
        ...(name ? { name } : {}),
        ...(idNumber ? { idNumber: normalizeIsraeliId(idNumber) ?? undefined } : {}),
        ...(date ? { date } : {}),
      },
    });
    created.push({ id, token, name, phone });
  }
  await insertDocuments(rows);
  return NextResponse.json({ documents: created });
}
