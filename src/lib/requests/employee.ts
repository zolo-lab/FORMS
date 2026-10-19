/** Pure helpers for employee records. */

/** ID number as stored: digits only, padded to 9 (Israeli ת"ז); anything else (passport…) kept trimmed and upper-cased. Empty → null. */
export function normalizeIdNumber(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/[\s-]/g, "");
  if (/^\d{5,9}$/.test(digits)) return digits.padStart(9, "0");
  return s.toUpperCase().slice(0, 20);
}
