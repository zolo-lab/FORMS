/**
 * Builds src/lib/forms/data/bank-branches.json from the Bank of Israel branch list on data.gov.il
 * (dataset "branches_for_payments", resource "סניפים לסליקה – עברית"). Closed branches are left out.
 *   pnpm tsx scripts/bank-branches.ts <file> [yyyy-mm-dd]
 * <file> is either that CSV (columns id, branch_code, branch_name, city, close_date…) or "bank|branch|name|city" lines.
 */
import { readFileSync, writeFileSync } from "node:fs";

/** Banks a salary can be paid into, with the short name people use. Card and payment companies are left out. */
const BANKS: Record<string, string> = {
  "03": "בנק אש", "04": "יהב", "09": "בנק הדואר", "10": "לאומי", "11": "דיסקונט", "12": "הפועלים", "14": "אוצר החייל",
  "17": "מרכנתיל", "18": "וואן זירו", "20": "מזרחי טפחות", "22": "סיטיבנק", "23": "HSBC", "26": "יובנק",
  "31": "הבינלאומי", "39": "SBI", "46": "מסד", "52": "פאגי", "54": "ירושלים",
};

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function read(file: string): { bank: string; branch: string; name: string; city: string }[] {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const tidy = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();
  if (text.startsWith("bank|")) {
    return text.split(/\r?\n/).slice(1).filter(Boolean).map((l) => {
      const [bank, branch, name, city] = l.split("|");
      return { bank: bank!, branch: branch!, name: tidy(name!), city: tidy(city!) };
    });
  }
  const [head, ...rows] = csvRows(text);
  const col = (n: string) => head!.findIndex((h) => h.trim() === n);
  const [b, br, nm, ct, cl] = ["id", "branch_code", "branch_name", "city", "close_date"].map(col);
  return rows.filter((r) => !tidy(r[cl!] ?? "")).map((r) => ({ bank: r[b!]!, branch: r[br!]!, name: tidy(r[nm!]!), city: tidy(r[ct!]!) }));
}

const [file, updated = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!file) throw new Error("usage: bank-branches <file> [yyyy-mm-dd]");
const branches: Record<string, [string, string, string][]> = {};
for (const r of read(file)) {
  const bank = String(Number(r.bank)).padStart(2, "0");
  if (!BANKS[bank] || !/^\d+$/.test(r.branch.trim())) continue;
  const list = (branches[bank] ??= []);
  const code = String(Number(r.branch));
  if (!list.some(([c]) => c === code)) list.push([code, r.name, r.city]);
}
for (const list of Object.values(branches)) list.sort((a, b) => Number(a[0]) - Number(b[0]));
const banks = Object.entries(BANKS).filter(([code]) => branches[code]).sort(([, a], [, b]) => a.localeCompare(b, "he"));
writeFileSync("src/lib/forms/data/bank-branches.json", JSON.stringify({ updated, banks, branches }));
console.log(`${banks.length} banks, ${Object.values(branches).reduce((n, l) => n + l.length, 0)} branches → src/lib/forms/data/bank-branches.json`);
