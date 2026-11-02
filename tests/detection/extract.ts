/** Reads a PDF the way the PDF tab does in the browser (text + drawing → GuessPage[]), in Node, for tests/scripts. */
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractShapes, type OpCodes } from "../../src/lib/pdf/geometry";
import { groupLabels, splitGlyphs, textItems } from "../../src/lib/pdf/labels";
import type { GuessPage } from "../../src/lib/pdf/guess";

export async function pageData(bytes: Uint8Array): Promise<GuessPage[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pages: GuessPage[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const [content, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
    const { items, squares } = splitGlyphs(textItems(content.items.filter((it): it is Extract<typeof it, { str: string }> => "str" in it)));
    const shapes = extractShapes(ops, pdfjs.OPS as unknown as OpCodes);
    pages.push({
      index: i,
      width: page.view[2]! - page.view[0]!,
      height: page.view[3]! - page.view[1]!,
      labels: groupLabels(i, items),
      shapes: { ...shapes, checkboxes: [...shapes.checkboxes, ...squares] },
    });
  }
  await doc.cleanup();
  return pages;
}
