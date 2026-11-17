import { NextResponse } from "next/server";
import { getByToken } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const doc = await getByToken(token);
  if (!doc) return NextResponse.json({ error: "הקישור אינו תקף" }, { status: 404 });
  if (doc.status === "signed") {
    return NextResponse.json({
      status: "signed",
      title: doc.title,
      signerName: doc.signerName,
      signedAt: doc.signedAt,
      imageUrl: `/api/s/${token}/file?signed=1`,
    });
  }
  return NextResponse.json({
    status: doc.status,
    title: doc.title,
    signerName: doc.signerName,
    oneSignature: doc.oneSignature,
    prefill: doc.prefill,
    fields: doc.fields,
    pages: doc.pages.map((page, index) => ({
      width: page.width,
      height: page.height,
      url: `/api/s/${token}/file?page=${index}`,
    })),
  });
}
