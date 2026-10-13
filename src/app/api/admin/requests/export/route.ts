import { toCsv } from "@/lib/export/csv";
import { buildExportTable } from "@/lib/export/rows";
import { buildXlsx } from "@/lib/export/xlsx";
import { zipStore } from "@/lib/export/zip";
import { parseFilters } from "@/lib/requests/list";
import { loadExport, loadFinalPdfs } from "@/server/export-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET ?format=csv|xlsx|zip  - selected requests (`id` repeated) or, without ids, everything matching the dashboard filters.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  const ids = url.searchParams.getAll("id").filter((i) => UUID.test(i));
  const sel = ids.length ? { ids } : { filters: parseFilters(Object.fromEntries(url.searchParams)) };
  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(new Date());

  if (format === "zip") {
    const pdfs = await loadFinalPdfs(sel);
    if (pdfs.length === 0) return Response.json({ error: "אין מסמכים חתומים בבקשות שנבחרו" }, { status: 404 });
    return new Response(Buffer.from(zipStore(pdfs)), {
      headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="signed-pdfs-${stamp}.zip"`, "cache-control": "no-store" },
    });
  }

  const table = buildExportTable(await loadExport(sel));
  if (format === "xlsx") {
    return new Response(Buffer.from(buildXlsx(table, "בקשות")), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="requests-${stamp}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  }
  return new Response(toCsv(table), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="requests-${stamp}.csv"`, "cache-control": "no-store" },
  });
}
