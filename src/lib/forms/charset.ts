/** "ספרות בלבד" / "עברית בלבד" / "אנגלית בלבד" of text fields: what may be typed, and the server check. */
export type Charset = "digits" | "hebrew" | "english";

export const CHARSET_LABELS: Record<Charset, string> = { digits: "ספרות בלבד", hebrew: "עברית בלבד", english: "אנגלית בלבד" };

const LATIN = /[A-Za-z]/g;
const HEBREW = /[֐-׿]/g;

/** digits: only 0-9 · hebrew: no Latin letters · english: no Hebrew letters. Spaces and punctuation are fine in text. */
export function matchesCharset(value: string, charset: Charset): boolean {
  if (charset === "digits") return /^\d+$/.test(value.trim());
  if (charset === "hebrew") return !new RegExp(LATIN.source).test(value);
  return !new RegExp(HEBREW.source).test(value);
}

/** Drops the characters a charset does not allow, as the filler types. */
export function filterCharset(value: string, charset: Charset | undefined): string {
  if (!charset) return value;
  if (charset === "digits") return value.replace(/\D/g, "");
  if (charset === "hebrew") return value.replace(LATIN, "");
  return value.replace(HEBREW, "");
}
