/**
 * A tiny kit for drawing Hebrew test forms as real PDFs, where every element also states the field detection
 * should find in it. The drawing and the expected answer come from the same call, so they never drift apart.
 * Coordinates are PDF points, y up; Hebrew forms run right to left, so labels end at `right`.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { drawHebrew, embedHebrewFont, measureHebrew } from "../../src/lib/pdf/hebrew";
import type { FieldType } from "../../src/lib/forms/field-types";

export interface ExpectedField {
  label: string;
  type: FieldType;
  page: number;
  /** The place the answer goes, in PDF points (detection must overlap it). */
  area?: { x: number; y: number; width: number; height: number };
  options?: string[];
  /** Detection may legitimately offer it only as a suggestion (no drawn place). */
  labelOnly?: boolean;
}

export interface TestForm {
  name: string;
  /** What the case is about, for the scoreboard. */
  pattern: string;
  bytes: Uint8Array;
  expected: ExpectedField[];
  /** Text on the page that must NOT become a field (headings, instructions). */
  notFields?: string[];
}

const SQ = 9;
const BLACK = rgb(0, 0, 0);

export class FormDraw {
  page!: PDFPage;
  pageIndex = -1;
  expected: ExpectedField[] = [];
  notFields: string[] = [];
  private constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {}

  static async create(): Promise<FormDraw> {
    const doc = await PDFDocument.create();
    const f = new FormDraw(doc, await embedHebrewFont(doc), await embedHebrewFont(doc, "bold"));
    f.newPage();
    return f;
  }

  newPage() {
    this.page = this.doc.addPage([595, 842]);
    this.pageIndex++;
  }

  /** Text whose right edge is at `right` (Hebrew), baseline y. Returns its left edge. */
  text(str: string, right: number, y: number, size = 10, bold = false): number {
    const font = bold ? this.bold : this.font;
    const w = measureHebrew(str, font, size) + 1;
    drawHebrew(this.page, str, { x: right - w, y, width: w + 2, size, font, align: "right" });
    return right - w;
  }
  line(x1: number, x2: number, y: number) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.7, color: BLACK });
  }
  rect(x: number, y: number, width: number, height: number, thickness = 0.7) {
    this.page.drawRectangle({ x, y, width, height, borderColor: BLACK, borderWidth: thickness });
  }
  vline(x: number, y1: number, y2: number) {
    this.page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.7, color: BLACK });
  }
  square(x: number, y: number) {
    this.rect(x, y, SQ, SQ, 0.6);
  }
  heading(str: string, right: number, y: number) {
    this.text(str, right, y, 12, true);
    this.notFields.push(str);
  }
  note(str: string, right: number, y: number) {
    this.text(str, right, y, 9);
    this.notFields.push(str);
  }

  // ---------- Elements that are fields ----------

  /** "שם פרטי ______" – a label and an underline to its left. */
  underline(label: string, type: FieldType, right: number, y: number, lineWidth = 160): number {
    const left = this.text(label, right, y);
    const x2 = left - 4;
    this.line(x2 - lineWidth, x2, y - 2);
    this.expected.push({ label, type, page: this.pageIndex, area: { x: x2 - lineWidth, y: y - 2, width: lineWidth, height: 14 } });
    return x2 - lineWidth;
  }
  /** "כתובת [          ]" – a label and a rectangle to its left. */
  box(label: string, type: FieldType, right: number, y: number, width = 180, height = 16): number {
    const left = this.text(label, right, y + 4);
    const x2 = left - 4;
    this.rect(x2 - width, y, width, height);
    this.expected.push({ label, type, page: this.pageIndex, area: { x: x2 - width, y, width, height } });
    return x2 - width;
  }
  /** The label sits above its line. */
  labelAbove(label: string, type: FieldType, right: number, y: number, lineWidth = 200) {
    this.text(label, right, y + 12);
    this.line(right - lineWidth, right, y);
    this.expected.push({ label, type, page: this.pageIndex, area: { x: right - lineWidth, y, width: lineWidth, height: 12 } });
  }
  /** "מספר זהות" over nine printed cells. */
  comb(label: string, type: FieldType, right: number, y: number, cells: number, cell = 14) {
    const left = this.text(label, right, y + 4);
    const x2 = left - 6;
    const x1 = x2 - cells * cell;
    this.rect(x1, y, cells * cell, 16);
    for (let i = 1; i < cells; i++) this.vline(x1 + i * cell, y, y + 16);
    this.expected.push({ label, type, page: this.pageIndex, area: { x: x1, y, width: cells * cell, height: 16 } });
  }
  /** A name with nothing drawn next to it ("שם המעסיק:"): only a suggestion is possible. */
  labelOnly(label: string, type: FieldType, right: number, y: number) {
    this.text(`${label}:`, right, y);
    this.expected.push({ label, type, page: this.pageIndex, labelOnly: true });
  }
  /** "☐ אני מצהיר/ה כי ..." – a square before a statement. */
  consent(statement: string, right: number, y: number) {
    this.square(right - SQ, y - 1);
    this.text(statement, right - SQ - 5, y);
    this.expected.push({ label: statement, type: "consent", page: this.pageIndex, area: { x: right - SQ, y: y - 1, width: SQ, height: SQ } });
  }
  /** "שאלה  ☐ א  ☐ ב  ☐ ג" on one row. */
  optionsRow(question: string, options: string[], right: number, y: number, type: FieldType = "radio", gap = 18): number {
    let x = this.text(question, right, y) - 12;
    const boxes: { x: number }[] = [];
    for (const o of options) {
      this.square(x - SQ, y - 1);
      boxes.push({ x: x - SQ });
      x = this.text(o, x - SQ - 4, y) - gap;
    }
    this.expected.push({ label: question, type, page: this.pageIndex, options });
    return x;
  }
  /** The question above, its options listed one under the other. */
  optionsColumn(question: string, options: string[], right: number, y: number) {
    this.text(question, right, y);
    options.forEach((o, i) => {
      const yy = y - 16 * (i + 1);
      this.square(right - SQ, yy - 1);
      this.text(o, right - SQ - 5, yy);
    });
    this.expected.push({ label: question, type: "radio", page: this.pageIndex, options });
  }
  /**
   * A ruled table row of questions side by side (Form 101 part ב): each cell has its title on top and its options
   * below, possibly in two rows. `cells` from right to left.
   */
  choiceCells(cells: { title: string; options: string[][] }[], right: number, y: number, widths: number[]) {
    let x = right;
    const top = y + 14;
    const bottom = y - 30;
    this.line(right - widths.reduce((a, b) => a + b, 0), right, top + 2);
    this.line(right - widths.reduce((a, b) => a + b, 0), right, bottom);
    this.vline(x, bottom, top + 2);
    cells.forEach((c, i) => {
      const w = widths[i]!;
      this.text(c.title, x - 6, y + 4);
      c.options.forEach((row, r) => {
        let ox = x - 6;
        const yy = y - 10 - r * 13;
        for (const o of row) {
          this.square(ox - SQ, yy - 1);
          ox = this.text(o, ox - SQ - 3, yy) - 10;
        }
      });
      x -= w;
      this.vline(x, bottom, top + 2);
      const flat = c.options.flat();
      const yesNo = flat.length === 2 && flat.includes("כן") && flat.includes("לא");
      this.expected.push({ label: c.title, type: yesNo ? "yes_no" : "radio", page: this.pageIndex, options: flat });
    });
  }
  /** A signature line: "חתימה ____". */
  signature(label: string, right: number, y: number) {
    const left = this.text(label, right, y);
    this.line(left - 4 - 150, left - 4, y - 2);
    this.expected.push({ label, type: "signature", page: this.pageIndex, area: { x: left - 154, y: y - 2, width: 150, height: 30 } });
  }
  /** A table: titles in a header row, ruled rows under them. */
  table(label: string, titles: string[], right: number, y: number, colWidth = 90, rows = 4) {
    const width = titles.length * colWidth;
    this.text(label, right, y + 26, 10, true);
    this.rect(right - width, y - rows * 16, width, 16 + rows * 16);
    titles.forEach((t, i) => {
      this.text(t, right - i * colWidth - 6, y + 4);
      if (i > 0) this.vline(right - i * colWidth, y - rows * 16, y + 16);
    });
    for (let r = 0; r <= rows; r++) this.line(right - width, right, y - r * 16);
    this.expected.push({ label, type: "repeating_table", page: this.pageIndex });
  }

  /** "שם פרטי: ____________" – the line is underscores typed as text, not a drawn line. */
  typedLine(label: string, type: FieldType, right: number, y: number, chars = 30, ch = "_"): number {
    const left = this.text(`${label}:`, right, y);
    const fill = ch.repeat(chars);
    const w = this.font.widthOfTextAtSize(fill, 10);
    this.page.drawText(fill, { x: left - 4 - w, y, size: 10, font: this.font, color: BLACK });
    this.expected.push({ label, type, page: this.pageIndex, area: { x: left - 4 - w, y: y - 2, width: w, height: 14 } });
    return left - 4 - w;
  }
  /** A ruled grid: each cell has its title at the top and empty room below to write in (Form 101 part א). */
  gridCells(cells: { title: string; type: FieldType }[], right: number, y: number, widths: number[], height = 30) {
    const total = widths.reduce((a, b) => a + b, 0);
    this.rect(right - total, y, total, height);
    let x = right;
    cells.forEach((c, i) => {
      this.text(c.title, x - 4, y + height - 10, 8);
      const w = widths[i]!;
      x -= w;
      if (i < cells.length - 1) this.vline(x, y, y + height);
      this.expected.push({ label: c.title, type: c.type, page: this.pageIndex, area: { x, y, width: w, height: height - 12 } });
    });
  }
  /**
   * A ruled grid whose small names are printed at the bottom of each cell, under the room to write
   * (Form 101 part ב: "רחוב/שכונה | מספר | עיר/ישוב | מיקוד"). A ruled row of other questions sits under it.
   */
  gridLabelsBelow(cells: { title: string; type: FieldType }[], right: number, y: number, widths: number[], height = 16) {
    const total = widths.reduce((a, b) => a + b, 0);
    this.line(right - total, right, y + height);
    this.line(right - total, right, y);
    this.line(right - total, right, y - 26); // the next row's bottom: another question lives there
    let x = right;
    this.vline(x, y - 26, y + height);
    cells.forEach((c, i) => {
      const w = widths[i]!;
      this.text(c.title, x - 4, y + 2, 7);
      this.expected.push({ label: c.title, type: c.type, page: this.pageIndex, area: { x: x - w, y: y + 6, width: w, height: height - 6 } });
      x -= w;
      this.vline(x, y, y + height);
    });
    this.vline(right - total, y - 26, y + height);
    this.text("הערות", right - 4, y - 12, 9);
    this.expected.push({ label: "הערות", type: "short_text", page: this.pageIndex, area: { x: right - total, y: y - 26, width: total - 40, height: 26 } });
  }

  /**
   * Form 101's address row: cells bounded only by short walls (no line on top), a writing line across them, and each
   * small name printed under that line.
   */
  captionsUnderLine(cells: { title: string; type: FieldType }[], right: number, y: number, widths: number[]) {
    const total = widths.reduce((a, b) => a + b, 0);
    this.line(right - total - 40, right, y); // the row's bottom border runs past the cells
    this.line(right - total, right, y + 7); // the writing line
    let x = right;
    this.vline(x, y, y + 14);
    cells.forEach((c, i) => {
      const w = widths[i]!;
      this.text(c.title, x - 4, y + 1.5, 6);
      this.expected.push({ label: c.title, type: c.type, page: this.pageIndex, area: { x: x - w, y: y + 7, width: w, height: 7 } });
      x -= w;
      this.vline(x, y, y + 14);
    });
  }

  /** A two-column ruled table: the name in the right cell, an empty cell to its left to write in. */
  labelValueTable(rows: { title: string; type: FieldType }[], right: number, y: number, labelWidth = 120, valueWidth = 220, rowHeight = 22) {
    const total = labelWidth + valueWidth;
    rows.forEach((r, i) => {
      const top = y - i * rowHeight;
      this.line(right - total, right, top);
      this.text(r.title, right - 6, top - 15, 10);
      this.expected.push({ label: r.title, type: r.type, page: this.pageIndex, area: { x: right - total, y: top - rowHeight, width: valueWidth, height: rowHeight } });
    });
    const bottom = y - rows.length * rowHeight;
    this.line(right - total, right, bottom);
    this.vline(right, bottom, y);
    this.vline(right - labelWidth, bottom, y);
    this.vline(right - total, bottom, y);
  }

  /** A walled cell titled on top whose options are long phrases, one per row (Form 101: חבר קיבוץ). */
  longOptionsCell(title: string, options: string[], right: number, y: number, width = 230) {
    const top = y + 14;
    const bottom = y - options.length * 13 - 4;
    this.rect(right - width, bottom, width, top - bottom);
    this.text(title, right - 6, y + 2);
    options.forEach((o, i) => {
      const yy = y - 12 - i * 13;
      this.square(right - 6 - SQ, yy - 1);
      this.text(o, right - 6 - SQ - 3, yy, 8);
    });
    this.expected.push({ label: title, type: "radio", page: this.pageIndex, options });
  }
  /** "חתימה:" with nothing drawn: a suggestion only. */
  signatureLabelOnly(label: string, right: number, y: number) {
    this.text(`${label}:`, right, y);
    this.expected.push({ label, type: "signature", page: this.pageIndex, labelOnly: true });
  }
  /** An option list whose last choice is "אחר" with a line to write on. */
  optionsWithOther(question: string, options: string[], right: number, y: number) {
    const x = this.optionsRow(question, [...options, "אחר"], right, y);
    this.line(x - 60, x + 14, y - 2);
  }

  /** Questions side by side with no rules at all: a title over each column, options in up to two rows under it. */
  alignedQuestions(cells: { title: string; options: string[][] }[], right: number, y: number, widths: number[]) {
    let x = right;
    cells.forEach((c, i) => {
      this.text(c.title, x - 2, y + 4);
      c.options.forEach((row, r) => {
        let ox = x - 2;
        const yy = y - 10 - r * 13;
        for (const o of row) {
          this.square(ox - SQ, yy - 1);
          ox = this.text(o, ox - SQ - 3, yy) - 10;
        }
      });
      x -= widths[i]!;
      const flat = c.options.flat();
      const yesNo = flat.length === 2 && flat.includes("כן") && flat.includes("לא");
      this.expected.push({ label: c.title, type: yesNo ? "yes_no" : "radio", page: this.pageIndex, options: flat });
    });
  }
  /** An English (left to right) label with its line to the right: "Email ________". */
  underlineLtr(label: string, type: FieldType, left: number, y: number, lineWidth = 160): number {
    const w = measureHebrew(label, this.font, 10) + 1;
    drawHebrew(this.page, label, { x: left, y, width: w + 2, size: 10, font: this.font, align: "left" });
    const x1 = left + w + 4;
    this.line(x1, x1 + lineWidth, y - 2);
    this.expected.push({ label, type, page: this.pageIndex, area: { x: x1, y: y - 2, width: lineWidth, height: 14 } });
    return x1 + lineWidth;
  }
  /** A ruled grid whose cell titles run over two lines ("מספר תיק / ניכויים"). */
  gridTwoLineTitles(cells: { title: [string, string]; label: string; type: FieldType }[], right: number, y: number, widths: number[], height = 40) {
    const total = widths.reduce((a, b) => a + b, 0);
    this.rect(right - total, y, total, height);
    let x = right;
    cells.forEach((c, i) => {
      this.text(c.title[0], x - 4, y + height - 10, 8);
      this.text(c.title[1], x - 4, y + height - 19, 8);
      const w = widths[i]!;
      x -= w;
      if (i < cells.length - 1) this.vline(x, y, y + height);
      this.expected.push({ label: c.label, type: c.type, page: this.pageIndex, area: { x, y, width: w, height: height - 22 } });
    });
  }
  /** The question on its own line, its options on the line under it (indented). */
  optionsBelow(question: string, options: string[], right: number, y: number, type: FieldType = "radio") {
    this.text(question, right, y);
    let x = right - 14;
    for (const o of options) {
      this.square(x - SQ, y - 17);
      x = this.text(o, x - SQ - 4, y - 16) - 18;
    }
    this.expected.push({ label: question, type, page: this.pageIndex, options });
  }
  /** Several digit-cell runs on one row: "מספר בנק [][]  מספר סניף [][][]  מספר חשבון [][][][][][]". */
  combsRow(items: { label: string; cells: number; type: FieldType }[], right: number, y: number, cell = 13) {
    let r = right;
    for (const it of items) {
      const left = this.text(it.label, r, y + 4);
      const x2 = left - 5;
      const x1 = x2 - it.cells * cell;
      this.rect(x1, y, it.cells * cell, 16);
      for (let i = 1; i < it.cells; i++) this.vline(x1 + i * cell, y, y + 16);
      this.expected.push({ label: it.label, type: it.type, page: this.pageIndex, area: { x: x1, y, width: it.cells * cell, height: 16 } });
      r = x1 - 16;
    }
  }

  /** One typed English line holding several fields: "Name: ________   ID: ________". */
  typedRowLtr(items: { label: string; type: FieldType; chars: number }[], left: number, y: number) {
    let str = "";
    for (const it of items) {
      const before = `${str}${it.label}: `;
      const x1 = left + this.font.widthOfTextAtSize(before, 10);
      const run = "_".repeat(it.chars);
      this.expected.push({ label: it.label, type: it.type, page: this.pageIndex, area: { x: x1, y: y - 2, width: this.font.widthOfTextAtSize(run, 10), height: 14 } });
      str = `${before}${run}   `;
    }
    this.page.drawText(str.trimEnd(), { x: left, y, size: 10, font: this.font, color: BLACK });
  }

  async build(name: string, pattern: string): Promise<TestForm> {
    return { name, pattern, bytes: await this.doc.save(), expected: this.expected, notFields: this.notFields };
  }
}
