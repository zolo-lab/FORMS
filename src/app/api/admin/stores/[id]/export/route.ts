import { NextResponse } from "next/server";
import { hasGrant } from "@/lib/auth/permissions";
import { buildXlsx } from "@/lib/export/xlsx";
import { exportRows } from "@/lib/stores/model";
import { getStore } from "@/server/stores-store";
import { currentUser } from "@/server/users-store";

/** The store as an Excel sheet: the column names, then a row per record (the same layout the import reads). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasGrant(await currentUser(), "manageForms")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const data = await getStore(id);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const bytes = buildXlsx(exportRows(data.store.columns, data.rows), data.store.name.replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet1");
  const name = encodeURIComponent(`${data.store.name}.xlsx`);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="store.xlsx"; filename*=UTF-8''${name}`,
      "cache-control": "no-store",
    },
  });
}
