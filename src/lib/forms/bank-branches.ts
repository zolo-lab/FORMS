/**
 * Israeli banks and their branches, from the Bank of Israel list on data.gov.il ("סניפים לסליקה", open branches
 * only). Refresh with `pnpm tsx scripts/bank-branches.ts <file>` (see the script). The list is small (≈1,400
 * branches) and changes rarely, so it ships with the app; the form loads it only where a bank field is shown.
 */
import data from "./data/bank-branches.json";

export interface Branch {
  /** Branch number as written on a cheque ("689"). */
  code: string;
  name: string;
  city: string;
}

interface BankBranchesData {
  /** Date of the source list (yyyy-mm-dd). */
  updated: string;
  /** [bank code (two digits), short Hebrew name], by code. */
  banks: [string, string][];
  /** Bank code → [branch code, branch name, city][]. */
  branches: Record<string, [string, string, string][]>;
}

const DATA = data as unknown as BankBranchesData;

export const BANK_LIST: { value: string; label: string }[] = DATA.banks.map(([code, name]) => ({ value: code, label: `${name} (${code})` }));

/** Bank codes are kept as two digits ("09", "12"); a stored "9" is the same bank. */
export const bankKey = (bank: string): string => (/^\d{1,3}$/.test(bank.trim()) ? bank.trim().padStart(2, "0") : bank.trim());
const branchKey = (branch: string): string => String(Number(branch.trim()));

/** The bank's branches sorted by number, or null when the list does not know the bank (then any number is accepted). */
export function branchesOf(bank: string): Branch[] | null {
  const rows = DATA.branches[bankKey(bank)];
  if (!rows) return null;
  return rows.map(([code, name, city]) => ({ code, name, city }));
}

/** Is this branch one of the bank's branches? True when the bank has no list (a bank the list does not cover). */
export function isKnownBranch(bank: string, branch: string): boolean {
  const list = DATA.branches[bankKey(bank)];
  if (!list) return true;
  if (!/^\d{1,4}$/.test(branch.trim())) return false;
  const k = branchKey(branch);
  return list.some(([code]) => branchKey(code) === k);
}

/** "689 · עפולה עלית (עפולה)" – how a branch reads in a list. */
export const branchLabel = (b: Branch): string => `${b.code} · ${b.name}${b.city && b.city !== b.name ? ` (${b.city})` : ""}`;

/** Search by number (prefix), branch name or city; numbers first when the query is a number. */
export function searchBranches(list: Branch[], query: string): Branch[] {
  const q = query.trim();
  if (!q) return list;
  if (/^\d+$/.test(q)) return list.filter((b) => b.code.startsWith(q) || String(Number(b.code)).startsWith(String(Number(q))));
  const n = q.replace(/["'״׳\-]/g, "").toLowerCase();
  const norm = (s: string) => s.replace(/["'״׳\-]/g, "").toLowerCase();
  return list.filter((b) => norm(b.name).includes(n) || norm(b.city).includes(n));
}

export const BRANCHES_UPDATED = DATA.updated;
