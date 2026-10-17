/**
 * Text of a PDF page as labels: pdf.js `getTextContent` items merged into the phrases a person reads
 * ("שם משפחה" is two words, maybe two items). Pure; coordinates are PDF points, origin bottom-left.
 */
export interface TextItem { str: string; x: number; y: number; width: number; height: number }
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
        if (gap > Math.max(prev.height, it.height) * 0.9) flush();
      }
      cur.push(it);
    }
    flush();
  }
  return labels;
}
