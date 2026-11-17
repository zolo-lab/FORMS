import { NextResponse } from "next/server";
import { getTemplate, insertTemplate } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const template = await getTemplate(id);
  if (!template) return NextResponse.json({ error: "התבנית לא נמצאה" }, { status: 404 });
  const copyId = crypto.randomUUID();
  await insertTemplate({
    id: copyId,
    name: `${template.name} (עותק)`.slice(0, 80),
    pages: template.pages,
    fields: template.fields.map((field) => ({ ...field, id: crypto.randomUUID() })),
    thumbPath: template.thumbPath,
  });
  return NextResponse.json({ id: copyId });
}
