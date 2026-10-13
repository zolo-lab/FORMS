/** CSV for Excel: UTF-8 BOM so Hebrew opens correctly, CRLF rows, quotes doubled. Guards against formula injection. */
export function csvCell(value: string): string {
  // A leading = + - @ makes Excel evaluate the cell; prefix a quote to keep it text.
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
