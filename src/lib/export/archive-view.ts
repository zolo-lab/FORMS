/** What the data-archive page shows of an export table: headers, a bounded number of rows, and whether it was cut. Pure. */

export const ARCHIVE_VIEW_LIMIT = 200;

export interface ArchiveView {
  headers: string[];
  rows: string[][];
  total: number;
  truncated: boolean;
}

/** `table` is `buildExportTable` output (header row first). Fixed leading columns stay; fully empty field columns are dropped. */
export function archiveView(table: string[][], limit = ARCHIVE_VIEW_LIMIT, fixedColumns = 8): ArchiveView {
  const [headers = [], ...all] = table;
  const keep = headers.map((_, i) => i < fixedColumns || all.some((r) => (r[i] ?? "") !== ""));
  const pick = (r: string[]) => r.filter((_, i) => keep[i]);
  const rows = all.slice(0, limit).map(pick);
  return { headers: pick(headers), rows, total: all.length, truncated: all.length > limit };
}
