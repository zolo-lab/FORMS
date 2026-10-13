/** Helpers for typed signatures / initials (the PNG itself is drawn on a canvas in the browser). */

/** First letter of every word: "ישראל זולו" → "יז"; hyphenated names count as two words. */
export function initialsOf(name: string): string {
  return name
    .split(/[\s\-–]+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean)
    .map((w) => {
      const c = Array.from(w)[0]!;
      return /[a-z]/i.test(c) ? c.toUpperCase() : c;
    })
    .join("");
}

/** Largest font size ≤ preferred that makes `text` fit `maxWidth` (measure(size, text) → width). */
export function fitFontSize(text: string, maxWidth: number, preferred: number, measure: (size: number, text: string) => number, min = 14): number {
  let size = preferred;
  while (size > min && measure(size, text) > maxWidth) size -= 2;
  return Math.max(size, min);
}
