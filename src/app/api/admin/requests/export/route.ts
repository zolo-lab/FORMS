import { toCsv } from "@/lib/export/csv";
import { buildExportTable } from "@/lib/export/rows";
import { buildXlsx } from "@/lib/export/xlsx";
import { applyTemplate } from "@/lib/export/template";
import { getExportTemplate } from "@/server/export-templates-store";
import { zipStream } from "@/lib/export/zip";
import { parseFilters } from "@/lib/requests/list";
import { finalPdfEntries, listFinalPdfs, loadExport } from "@/server/export-store";
import { hasGrant } from "@/lib/auth/permissions";
import { currentUser, viewerScope } from "@/server/users-store";

export const maxDuration = 60;

const MAX_ZIP_FILES = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET ?format=csv|xlsx|zip  - selected requests (`id` repeated) or, without ids, everything matching the dashboard filters.
 */
export async function GET(req: Request) {
  if (!hasGrant(await currentUser(), "export")) return Response.json({ error: "אין לך הרשאה לייצא" }, { status: 403 });
  const scope = await viewerScope();
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  const ids = url.searchParams.getAll("id").filter((i) => UUID.test(i));
  const sel = ids.length ? { ids, scope } : { filters: parseFilters(Object.fromEntries(url.searchParams)), scope };
  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(new Date());

  if (format === "zip") {
    const list = await listFinalPdfs(sel);
    if (list.length === 0) return Response.json({ error: "אין מסמכים חתומים בבקשות שנבחרו" }, { status: 404 });
    if (list.length > MAX_ZIP_FILES) return Response.json({ error: `יותר מדי מסמכים (${list.length}). צמצמו את הסינון ל-${MAX_ZIP_FILES} לכל היותר` }, { status: 413 });
    // Streamed one file at a time: no whole-archive buffer, and no 4.5MB cap on the response body.
    const parts = zipStream(finalPdfEntries(list));
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value, done } = await parts.next();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      async cancel() {
        await parts.return(undefined);
      },
    });
    return new Response(body, {
      headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="signed-pdfs-${stamp}.zip"`, "cache-control": "no-store" },
    });
  }

  // A saved export template (e.g. the Priority import sheet) decides the columns; otherwise one column per field.
  const templateId = url.searchParams.get("template") ?? "";
  const tpl = UUID.test(templateId) ? await getExportTemplate(templateId) : null;
  const loaded = await loadExport(sel);
  const table = tpl ? applyTemplate(tpl.template, loaded) : buildExportTable(loaded);
  const base = tpl ? `export-${stamp}` : `requests-${stamp}`;
  if (format === "xlsx") {
    return new Response(Buffer.from(buildXlsx(table, tpl?.template.sheetName || "בקשות")), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${base}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  }
  return new Response(toCsv(table), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${base}.csv"`, "cache-control": "no-store" },
  });
}
