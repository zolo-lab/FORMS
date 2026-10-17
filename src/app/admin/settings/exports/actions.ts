"use server";
import { requireAdmin } from "@/server/guards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseSheet } from "@/lib/import/sheet";
import { FIXED_SOURCES, VALUE_FORMATS, guessColumns, type ColumnSource, type FixedSource, type TemplateColumn, type ValueFormat } from "@/lib/export/template";
import { createExportTemplate, deleteExportTemplate, getExportTemplate, packageDefinitions, updateExportTemplate } from "@/server/export-templates-store";

const UUID = /^[0-9a-f-]{36}$/i;
const LIST = "/admin/settings/exports";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const MAX_BYTES = 5 * 1024 * 1024;

/** Upload the file the other system imports: its first non-empty row becomes the template's columns. */
export async function createExportTemplateAction(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) redirect(`${LIST}?error=name`);
  const pkg = str(fd, "packageTemplateId");
  const packageTemplateId = UUID.test(pkg) ? pkg : null;
  const file = fd.get("file");
  let headers: string[] = [];
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) redirect(`${LIST}?error=size`);
    try {
      const rows = parseSheet(new Uint8Array(await file.arrayBuffer()));
      headers = (rows.find((r) => r.some((c) => c.trim())) ?? []).map((c) => c.trim());
      while (headers.length && !headers.at(-1)) headers.pop();
    } catch {
      redirect(`${LIST}?error=file`);
    }
  } else {
    headers = str(fd, "headers").split(/[,\t\n]/).map((h) => h.trim()).filter(Boolean);
  }
  if (!headers.length) redirect(`${LIST}?error=headers`);
  const defs = packageTemplateId ? await packageDefinitions(packageTemplateId) : [];
  const id = await createExportTemplate(name, packageTemplateId, { name, columns: guessColumns(headers, defs), includeHeader: true });
  revalidatePath(LIST);
  redirect(`${LIST}/${id}?created=1`);
}

/** "empty" · "const" · "fixed:<key>" · "field:<id>" · "field:<id>.<part>" */
function parseSource(raw: string, constValue: string): ColumnSource {
  if (raw === "const") return { kind: "const", value: constValue };
  if (raw.startsWith("fixed:")) {
    const key = raw.slice(6);
    return key in FIXED_SOURCES ? { kind: "fixed", key: key as FixedSource } : { kind: "empty" };
  }
  if (raw.startsWith("field:")) {
    const [key, part] = raw.slice(6).split(".");
    return key ? { kind: "field", key, ...(part ? { part } : {}) } : { kind: "empty" };
  }
  return { kind: "empty" };
}

export async function saveExportTemplateAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  if (!UUID.test(id)) redirect(LIST);
  if (str(fd, "intent") === "delete") {
    await deleteExportTemplate(id);
    revalidatePath(LIST);
    redirect(LIST);
  }
  const current = await getExportTemplate(id);
  if (!current) redirect(LIST);
  const name = str(fd, "name") || current.name;
  const count = Number(str(fd, "count"));
  const columns: TemplateColumn[] = [];
  for (let i = 0; i < count && i < 500; i++) {
    const header = str(fd, `h${i}`);
    const fmt = str(fd, `f${i}`);
    const format = (VALUE_FORMATS as readonly string[]).includes(fmt) && fmt !== "text" ? (fmt as ValueFormat) : undefined;
    columns.push({ header, source: parseSource(str(fd, `s${i}`), String(fd.get(`c${i}`) ?? "")), ...(format ? { format } : {}) });
  }
  if (str(fd, "intent") === "add") columns.push({ header: "עמודה חדשה", source: { kind: "empty" } });
  const pkg = str(fd, "packageTemplateId");
  await updateExportTemplate(id, {
    name,
    packageTemplateId: UUID.test(pkg) ? pkg : null,
    template: { name, columns, includeHeader: fd.get("includeHeader") === "on", sheetName: str(fd, "sheetName") || undefined },
  });
  revalidatePath(`${LIST}/${id}`);
  redirect(`${LIST}/${id}?saved=1`);
}
