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

/** A field as kept, plus the name it was detected with (it may have been renamed in the dialog). */
export type TextField = Pick<DetectedField, "page" | "label" | "box" | "options"> & { aliases?: string[] };

type Box = { x: number; y: number; width: number; height: number };
const mid = (l: PageLabel) => l.y + l.height * 0.35;
const LIST_ITEM = /^\s*(?:\d{1,2}[.)]|[•●▪\-–])\s*/;

interface Line { text: string; x: number; right: number; y: number; top: number; height: number }

/**
 * The document's text that is not part of a field: every printed line that is not the name of one of `fields`
 * (nor one of its options, nor written inside its place), grouped into paragraphs and titles in reading order
 * (page, top to bottom; a line's pieces right to left). A proposal the admin did not keep stays here as text.
 * Pieces far apart on the same height are separate columns, and each column has its own paragraphs. Lines one under
 * the other with a normal line gap are one paragraph; a numbered or bulleted line starts its own line in it. Pure.
 */
export function documentTextBlocks(pages: GuessPage[], fields: TextField[]): TextBlock[] {
  const out: TextBlock[] = [];
  for (const page of pages) {
    const mine = fields.filter((f) => f.page === page.index);
    const heights = page.labels.map((l) => l.height).sort((a, b) => a - b);
    const usual = heights[Math.floor(heights.length / 2)] ?? 10;

    const near = (l: PageLabel, box: Box, reach: number) =>
      Math.abs(mid(l) - (box.y + box.height / 2)) <= Math.max(l.height, box.height / 2) + reach && l.x < box.x + box.width + 400 && l.x + l.width > box.x - 400;
    const inside = (l: PageLabel, box: Box) =>
      l.x >= box.x - 1 && l.x + l.width <= box.x + box.width + 1 && mid(l) >= box.y - 1 && mid(l) <= box.y + box.height + 1;
    const isFieldText = (l: PageLabel) => {
      // The printed wording, whole and as detection reads a name (no remark in brackets, a sentence's last words).
      const forms = [cleanLabel(l.str, true), cleanLabel(l.str)].map(normalizeText).filter(Boolean);
      if (!forms.length) return true; // blanks to write on, punctuation, a lone number
      return mine.some((f) => {
        if (inside(l, f.box)) return true;
        const names = [f.label, ...(f.aliases ?? [])].map(normalizeText).filter(Boolean);
        return (names.some((n) => forms.includes(n)) && near(l, f.box, 30))
          || (f.options ?? []).some((o) => forms.includes(normalizeText(o.label)) && near(l, o.box, 6));
      });
    };

    // Rows: pieces on the same height and close to each other, right to left. A wide gap starts another column.
    const rows: PageLabel[][] = [];
    for (const l of [...page.labels].filter((x) => !isFieldText(x)).sort((a, b) => mid(b) - mid(a) || b.x - a.x)) {
      const gap = Math.max(40, l.height * 4);
      const row = rows.find((r) => Math.abs(mid(r[0]!) - mid(l)) <= l.height * 0.6
        && r.some((p) => Math.max(p.x - (l.x + l.width), l.x - (p.x + p.width)) <= gap));
      if (row) row.push(l);
      else rows.push([l]);
    }
    const lines: Line[] = rows.map((r) => {
      const parts = r.sort((a, b) => b.x - a.x);
      return {
        text: parts.map((p) => p.str.trim()).join(" ").replace(/\s+/g, " ").trim(),
        x: Math.min(...parts.map((p) => p.x)),
        right: Math.max(...parts.map((p) => p.x + p.width)),
        y: Math.min(...parts.map((p) => p.y)),
        top: Math.max(...parts.map((p) => p.y + p.height)),
        height: Math.max(...parts.map((p) => p.height)),
      };
    }).filter((l) => l.text);

    // Paragraphs: a line right under the last line of a paragraph in the same column continues it. Several
    // paragraphs can be open at once (side-by-side columns).
    const paras: Line[][] = [];
    for (const l of lines) {
      const open = paras.find((p) => {
        const prev = p[p.length - 1]!;
        return prev.y - l.top <= l.height * 0.9 && prev.y - l.top >= -l.height * 0.3
          && l.x < prev.right && l.right > prev.x
          && l.height <= prev.height * 1.12 && prev.height <= l.height * 1.12;
      });
      if (open) open.push(l);
      else paras.push([l]);
    }
    const blocks = paras.map((ls): TextBlock => {
      const x = Math.min(...ls.map((l) => l.x));
      const y = Math.min(...ls.map((l) => l.y));
      return {
        page: page.index,
        box: { x, y, width: Math.max(...ls.map((l) => l.right)) - x, height: Math.max(...ls.map((l) => l.top)) - y },
        text: ls.reduce((t, l, i) => (i === 0 ? l.text : LIST_ITEM.test(l.text) ? `${t}\n${l.text}` : `${t} ${l.text}`), ""),
        heading: ls.length === 1 && ls[0]!.height > usual * 1.12,
      };
    });
    // Reading order: top to bottom, then right to left.
    blocks.sort((a, b) => {
      const ta = a.box.y + a.box.height;
      const tb = b.box.y + b.box.height;
      return Math.abs(ta - tb) > 6 ? tb - ta : b.box.x + b.box.width - (a.box.x + a.box.width);
    });
    out.push(...blocks);
  }
  return out;
}
