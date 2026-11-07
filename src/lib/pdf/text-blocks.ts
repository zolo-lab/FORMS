import type { GuessPage } from "./guess";
import type { PageLabel } from "./labels";
import type { DetectedField } from "./detect";
import { cleanLabel } from "./detect";
import { normalizeText } from "./match";

/** A run of the document's own text (a title or a paragraph), for the responsive form. Coordinates as in the PDF. */
export interface TextBlock {
  page: number;
  box: { x: number; y: number; width: number; height: number };
  text: string;
  /** Printed larger than the text around it, on one line: a title. */
  heading: boolean;
}

const mid = (l: PageLabel) => l.y + l.height * 0.35;
const LIST_ITEM = /^\s*(?:\d{1,2}[.)]|[•●▪\-–])\s*/;

/**
 * The document's text that is not part of a field: every printed line that is not the name of one of `fields`
 * (nor one of its options, nor written inside its place), grouped into paragraphs and titles in reading order
 * (page, top to bottom; a line's pieces right to left). A proposal the admin did not keep stays here as text.
 * Lines one under the other with a normal line gap are one paragraph; a numbered or bulleted line starts its own
 * line inside it. Pure.
 */
export function documentTextBlocks(pages: GuessPage[], fields: Pick<DetectedField, "page" | "label" | "box" | "options">[]): TextBlock[] {
  const out: TextBlock[] = [];
  for (const page of pages) {
    const mine = fields.filter((f) => f.page === page.index);
    const heights = page.labels.map((l) => l.height).sort((a, b) => a - b);
    const usual = heights[Math.floor(heights.length / 2)] ?? 10;

    const near = (l: PageLabel, box: { x: number; y: number; width: number; height: number }, reach: number) =>
      Math.abs(mid(l) - (box.y + box.height / 2)) <= Math.max(l.height, box.height / 2) + reach && l.x < box.x + box.width + 400 && l.x + l.width > box.x - 400;
    const inside = (l: PageLabel, box: { x: number; y: number; width: number; height: number }) =>
      l.x >= box.x - 1 && l.x + l.width <= box.x + box.width + 1 && mid(l) >= box.y - 1 && mid(l) <= box.y + box.height + 1;
    const isFieldText = (l: PageLabel) => {
      const n = normalizeText(cleanLabel(l.str, true));
      if (!n) return true; // blanks to write on, punctuation
      return mine.some((f) =>
        inside(l, f.box)
        || (normalizeText(f.label) === n && near(l, f.box, 30))
        || (f.options ?? []).some((o) => normalizeText(o.label) === n && near(l, o.box, 6)));
    };

    // Lines: pieces on the same row, right to left.
    const rows: PageLabel[][] = [];
    for (const l of [...page.labels].filter((x) => !isFieldText(x)).sort((a, b) => mid(b) - mid(a) || b.x - a.x)) {
      const row = rows.find((r) => Math.abs(mid(r[0]!) - mid(l)) <= l.height * 0.6);
      if (row) row.push(l);
      else rows.push([l]);
    }
    const lines = rows.map((r) => {
      const parts = r.sort((a, b) => b.x - a.x);
      const x = Math.min(...parts.map((p) => p.x));
      const right = Math.max(...parts.map((p) => p.x + p.width));
      const y = Math.min(...parts.map((p) => p.y));
      const top = Math.max(...parts.map((p) => p.y + p.height));
      return { text: parts.map((p) => p.str.trim()).join(" ").replace(/\s+/g, " ").trim(), x, right, y, top, height: Math.max(...parts.map((p) => p.height)) };
    }).filter((l) => l.text);

    // Paragraphs: a line right under the previous one (normal line gap, same column) continues it.
    let cur: { lines: typeof lines } | null = null;
    const flush = () => {
      if (!cur) return;
      const ls = cur.lines;
      const text = ls.reduce((t, l, i) => (i === 0 ? l.text : LIST_ITEM.test(l.text) ? `${t}\n${l.text}` : `${t} ${l.text}`), "");
      const x = Math.min(...ls.map((l) => l.x));
      const y = Math.min(...ls.map((l) => l.y));
      const right = Math.max(...ls.map((l) => l.right));
      const top = Math.max(...ls.map((l) => l.top));
      out.push({ page: page.index, box: { x, y, width: right - x, height: top - y }, text, heading: ls.length === 1 && ls[0]!.height > usual * 1.12 });
      cur = null;
    };
    for (const l of lines) {
      const prev = cur?.lines[cur.lines.length - 1];
      const continues = prev && prev.y - l.top <= l.height * 0.9 && l.x < prev.right && l.right > prev.x && l.height <= prev.height * 1.12 && prev.height <= l.height * 1.12;
      if (!continues) {
        flush();
        cur = { lines: [l] };
      } else cur!.lines.push(l);
    }
    flush();
  }
  return out;
}
