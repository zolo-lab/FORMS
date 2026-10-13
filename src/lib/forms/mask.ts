/**
 * Input masks for short text: "9" = digit, "a" = letter (Hebrew or Latin), "*" = letter or digit; anything else is literal.
 * "999-9999999" shows 050-1234567 and stores 0501234567 (mask characters are never stored).
 */
const CLASSES: Record<string, RegExp> = {
  "9": /\d/,
  a: /[A-Za-z֐-׿]/,
  "*": /[A-Za-z0-9֐-׿]/,
};

const isSlot = (c: string) => c in CLASSES;

export function maskSlots(mask: string): number {
  return Array.from(mask).filter(isSlot).length;
}

/** Keep only the characters that fit the mask slots, in order (extra or wrong characters are dropped). */
export function stripMask(input: string, mask: string): string {
  const out: string[] = [];
  const chars = Array.from(input);
  let p = 0;
  for (const m of mask) {
    if (!isSlot(m)) continue;
    while (p < chars.length && !CLASSES[m]!.test(chars[p]!)) p++;
    if (p >= chars.length) break;
    out.push(chars[p++]!);
  }
  return out.join("");
}

/** Format a raw value for display. A literal appears only once a character after it has been typed, so Backspace never gets stuck on it. */
export function applyMask(raw: string, mask: string): string {
  const chars = Array.from(stripMask(raw, mask));
  let out = "";
  let i = 0;
  for (const m of mask) {
    if (isSlot(m)) {
      if (i >= chars.length) break;
      out += chars[i++];
    } else if (i < chars.length) {
      out += m;
    } else break;
  }
  return out;
}

/** True when a stored (raw) value fills every slot with the right kind of character. */
export function matchesMask(raw: string, mask: string): boolean {
  const chars = Array.from(raw);
  const slots = Array.from(mask).filter(isSlot);
  return chars.length === slots.length && slots.every((m, i) => CLASSES[m]!.test(chars[i]!));
}
