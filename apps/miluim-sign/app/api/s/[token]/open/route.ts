import { NextResponse } from "next/server";
import { getByToken, markOpened } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const doc = await getByToken(token);
  if (!doc) return NextResponse.json({ error: "הקישור אינו תקף" }, { status: 404 });
  await markOpened(token);
  return NextResponse.json({ ok: true });
}
