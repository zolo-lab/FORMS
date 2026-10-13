/** Per-organization theme: validated color → CSS variables for the signing screens. */
export function normalizeHex(input: string | null | undefined): string | null {
  const v = (input ?? "").trim().toLowerCase();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (!m) return null;
  const h = m[1]!;
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function orgThemeVars(color: string | null | undefined): Record<string, string> | null {
  const hex = normalizeHex(color);
  if (!hex) return null;
  return { "--primary": hex, "--primary-foreground": luminance(hex) > 0.4 ? "#111111" : "#ffffff" };
}
