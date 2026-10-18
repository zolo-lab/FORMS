/**
 * Text of a PDF page as labels: pdf.js `getTextContent` items merged into the phrases a person reads
 * ("שם משפחה" is two words, maybe two items). Pure; coordinates are PDF points, origin bottom-left.
 */
export interface TextItem {
  str: string; x: number; y: number; width: number; height: number;
  /** Cut out of a longer item next to a checkbox glyph: never merged with its neighbours into one label. */
  solo?: boolean;
}
export interface PageLabel extends TextItem { id: string; page: number }

const HEBREW = /[֐-׿]/;

/** pdf.js text items → boxes. Whitespace-only items are dropped. */
export function textItems(items: { str?: string; transform?: number[]; width?: number; height?: number }[]): TextItem[] {
  const out: TextItem[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim() || !it.transform || it.transform.length < 6) continue;
    const height = it.height || Math.abs(it.transform[3]!) || 10;
    out.push({ str: it.str, x: it.transform[4]!, y: it.transform[5]!, width: it.width ?? 0, height });
  }
  return out;
}

/** Merge items on one baseline whose gap is no wider than a word space; Hebrew lines read right to left. */
export function groupLabels(page: number, items: TextItem[]): PageLabel[] {
  const lines: TextItem[][] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const line = lines.find((l) => Math.abs(l[0]!.y - it.y) <= 2);
    if (line) line.push(it);
    else lines.push([it]);
  }
  const labels: PageLabel[] = [];
  for (const line of lines) {
    const rtl = line.filter((i) => HEBREW.test(i.str)).length * 2 >= line.length;
    const sorted = [...line].sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
    let cur: TextItem[] = [];
    const flush = () => {
      if (!cur.length) return;
      const x = Math.min(...cur.map((i) => i.x));
      const right = Math.max(...cur.map((i) => i.x + i.width));
      labels.push({
        id: `p${page}_l${labels.length}`,
        page,
        str: cur.map((i) => i.str.trim()).join(" "),
        x,
        y: Math.min(...cur.map((i) => i.y)),
        width: right - x,
        height: Math.max(...cur.map((i) => i.height)),
      });
      cur = [];
    };
    for (const it of sorted) {
      const prev = cur[cur.length - 1];
      if (prev) {
        const gap = rtl ? prev.x - (it.x + it.width) : it.x - (prev.x + prev.width);
        if (it.solo || prev.solo || gap > Math.max(prev.height, it.height) * 0.9) flush();
      }
      cur.push(it);
    }
    flush();
  }
  return labels;
}

/** Symbol-font bullets many forms use as checkbox squares come out of the text layer as a lone "o" or "q". */
const GLYPH = /^[oq□☐❑]$/;

/**
 * Takes the checkbox glyphs out of the text: returns the remaining text (cut apart at each glyph, so
 * "o זכר o נקבה" becomes two labels) and a small square where each glyph is drawn. The place inside an item is
 * estimated from the character position, which is close enough to put a stamp on the square.
 */
export function splitGlyphs(items: TextItem[]): { items: TextItem[]; squares: { x: number; y: number; width: number; height: number }[] } {
  const out: TextItem[] = [];
  const squares: { x: number; y: number; width: number; height: number }[] = [];
  for (const it of items) {
    const tokens = [...it.str.matchAll(/\S+/g)];
    if (!tokens.some((t) => GLYPH.test(t[0]))) { out.push(it); continue; }
    const len = it.str.length || 1;
    const rtl = HEBREW.test(it.str);
    const at = (start: number, end: number) => ({
      x: rtl ? it.x + it.width * (1 - end / len) : it.x + (it.width * start) / len,
      w: (it.width * (end - start)) / len,
    });
    let seg: { start: number; end: number } | null = null;
    const flush = () => {
      if (!seg) return;
      const text = it.str.slice(seg.start, seg.end).trim();
      if (text) {
        const p = at(seg.start, seg.end);
        out.push({ str: text, x: p.x, y: it.y, width: p.w, height: it.height, solo: true });
      }
      seg = null;
    };
    for (const t of tokens) {
      const start = t.index ?? 0;
      const end = start + t[0].length;
      if (GLYPH.test(t[0])) {
        flush();
        const p = at(start, end);
        const size = Math.min(10, Math.max(7, it.height * 0.8));
        squares.push({ x: p.x + p.w / 2 - size / 2, y: it.y - 1, width: size, height: size });
      } else if (seg) seg.end = end;
      else seg = { start, end };
    }
    flush();
  }
  return { items: out, squares };
}
