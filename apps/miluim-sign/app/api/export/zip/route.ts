import { zipSync } from "fflate";
import { NextResponse } from "next/server";
import { listDocuments } from "@/lib/db";
import { formatWhen } from "@/lib/types";
import { readBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const documents = (await listDocuments()).filter((doc) => doc.status === "signed" && doc.signedImagePath);
  if (!documents.length) return NextResponse.json({ error: "אין טפסים חתומים" }, { status: 404 });
  const files: Record<string, Uint8Array> = {};
  const lines = ["שם\tטלפון\tנחתם\tSHA-256"];
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]!;
    const file = await readBytes(doc.signedImagePath!);
    if (!file) continue;
    const name = (doc.signerName || doc.signerPhone || `טופס-${i + 1}`).replace(/[\\/:*?"<>|\t\n\r]/g, "").trim() || `טופס-${i + 1}`;
    files[`${String(i + 1).padStart(2, "0")}-${name}.jpg`] = file.bytes;
    lines.push([doc.signerName, doc.signerPhone, formatWhen(doc.signedAt), doc.fileHash ?? ""].join("\t"));
  }
  files["evidence.txt"] = new TextEncoder().encode(`\uFEFF${lines.join("\n")}\n`);
  const zipped = zipSync(files);
  return new NextResponse(Buffer.from(zipped), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": "attachment; filename=\"signed-forms.zip\"",
      "cache-control": "private, no-store",
    },
  });
}
