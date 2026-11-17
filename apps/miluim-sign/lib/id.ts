/**
 * Israeli ID (ת"ז) check digit. Same Luhn variant as the main forms app
 * (`src/lib/validators/israeli.ts`): odd positions ×1, even ×2, subtract 9 when the
 * product is over 9, total divisible by 10. Leading zeros are allowed. Separators a
 * person might type (space, hyphen) are ignored; any other character rejects the value.
 */
const SEPARATORS = new Set([" ", "-", "–", "—", "\t", "\u00a0"]);

export function stripIsraeliId(raw: string): string {
  let out = "";
  for (const c of raw.trim()) {
    if (SEPARATORS.has(c)) continue;
    out += c;
  }
  return out;
}

export function isValidIsraeliId(raw: string): boolean {
  const id = stripIsraeliId(raw);
  if (!/^\d{1,9}$/.test(id)) return false;
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

/** Nine-digit form, or null when the check digit fails. */
export function normalizeIsraeliId(raw: string): string | null {
  if (!isValidIsraeliId(raw)) return null;
  return stripIsraeliId(raw).padStart(9, "0");
}
