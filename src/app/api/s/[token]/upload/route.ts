import { NextResponse } from "next/server";
import { uploadForToken } from "@/server/signing";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const r = await uploadForToken(token, file, req.headers.get("cookie"));
  if (r.ok) return NextResponse.json(r.file);
  const status = r.state === "otp_required" ? 401 : r.state === "too_big" ? 413 : r.state === "bad_type" || r.state === "empty" ? 400 : 410;
  return NextResponse.json({ error: r.state }, { status });
}
