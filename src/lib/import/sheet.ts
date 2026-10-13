/** Spreadsheet input for the bulk send: first sheet of an XLSX, or a CSV, as rows of strings. */
import { unzip } from "./unzip";

const decodeXml = (s: string) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** "C12" → zero-based column 2. */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textOf(xml: string): string {
  // <t>…</t> runs inside an <si> or <is>; rich text has several.
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]!)).join("");
}

export const MAX_ROWS = 2000;

export function parseXlsx(bytes: Uint8Array): string[][] {
  const files = unzip(bytes);
  const dec = new TextDecoder();
  const get = (n: string) => (files.has(n) ? dec.decode(files.get(n)!) : null);

  const shared: string[] = [];
  const sst = get("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]!));

  // First sheet: workbook order → relationship target; fall back to sheet1.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = get("xl/workbook.xml");
  const rels = get("xl/_rels/workbook.xml.rels");
  const rid = wb ? /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1] : undefined;
  if (rid && rels) {
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (new RegExp(`\\bId="${rid}"`).test(m[0])) {
        const t = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
        if (t) sheetPath = t.startsWith("/") ? t.slice(1) : `xl/${t}`;
      }
    }
  }
  const sheet = get(sheetPath);
  if (!sheet) throw new Error("worksheet not found");

  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!;
      const body = cm[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "";
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1])] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      const idx = ref ? columnIndex(ref) : row.length;
      while (row.length < idx) row.push("");
      row[idx] = value;
    }
    rows.push(row);
    if (rows.length > MAX_ROWS + 1) throw new Error(`too many rows (max ${MAX_ROWS})`);
  }
  return trimRows(rows);
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
      if (rows.length > MAX_ROWS + 1) throw new Error(`too many rows (max ${MAX_ROWS})`);
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return trimRows(rows);
}

/** Drops empty trailing rows/columns and trims cells. */
function trimRows(rows: string[][]): string[][] {
  const cleaned = rows.map((r) => r.map((c) => c.trim()));
  while (cleaned.length && cleaned[cleaned.length - 1]!.every((c) => c === "")) cleaned.pop();
  const width = cleaned.reduce((w, r) => {
    let last = r.length;
    while (last > 0 && r[last - 1] === "") last--;
    return Math.max(w, last);
  }, 0);
  return cleaned.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
}

/** XLSX (by its ZIP signature) or CSV. */
export function parseSheet(bytes: Uint8Array): string[][] {
  if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return parseXlsx(bytes);
  return parseCsv(new TextDecoder("utf-8").decode(bytes));
}
