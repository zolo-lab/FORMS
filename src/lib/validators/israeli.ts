/** Israeli-specific validators (pure functions, unit-tested). */

/** Israeli ID (ת"ז) check digit (Luhn variant). Accepts up to 9 digits; pads with leading zeros. */
export function isValidIsraeliId(raw: string): boolean {
  const id = raw.trim();
  if (!/^\d{5,9}$/.test(id)) return false;
  const padded = id.padStart(9, "0");
  if (padded === "000000000") return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

/** Normalise an Israeli phone to digits only, converting +972 / 972 prefix to 0. */
export function normalizeIsraeliPhone(raw: string): string {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+972")) d = "0" + d.slice(4);
  else if (d.startsWith("972")) d = "0" + d.slice(3);
  return d.replace(/\D/g, "");
}

/** Mobile (05x, 10 digits) or landline (0[2-4,8,9] 9 digits; 07x 10 digits). */
export function isValidIsraeliPhone(raw: string): boolean {
  const d = normalizeIsraeliPhone(raw);
  return /^05\d{8}$/.test(d) || /^0[23489]\d{7}$/.test(d) || /^07\d{8}$/.test(d);
}

/** Format 0501234567 → 050-1234567. */
export function formatIsraeliPhone(raw: string): string {
  const d = normalizeIsraeliPhone(raw);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return raw;
}

/** Israeli postal code: 7 digits. */
export function isValidIsraeliZip(raw: string): boolean {
  return /^\d{7}$/.test(raw.trim());
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

/** Bank code 2 digits, branch up to 3 digits, account 4–13 digits (format only). */
export function isValidBankAccount(v: { bank?: string; branch?: string; account?: string }): boolean {
  return (
    /^\d{1,3}$/.test(v.bank ?? "") &&
    /^\d{1,3}$/.test(v.branch ?? "") &&
    /^\d{4,13}$/.test((v.account ?? "").replace(/[-\s]/g, ""))
  );
}
