"use client";
/** Reads the text and the drawn lines/boxes of every page of an opened PDF (pdf.js, in the browser). */
import type { PDFDocumentProxy } from "pdfjs-dist";
import { extractShapes, type OpCodes } from "@/lib/pdf/geometry";
import { groupLabels, textItems } from "@/lib/pdf/labels";
import type { GuessPage } from "@/lib/pdf/guess";

export async function extractPageData(doc: PDFDocumentProxy, sizes: { width: number; height: number }[]): Promise<GuessPage[]> {
  const { OPS } = await import("pdfjs-dist");
  const pages: GuessPage[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const [content, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
    const size = sizes[i] ?? { width: page.view[2]! - page.view[0]!, height: page.view[3]! - page.view[1]! };
    pages.push({
      index: i,
      width: size.width,
      height: size.height,
      labels: groupLabels(i, textItems(content.items.filter((it): it is Extract<typeof it, { str: string }> => "str" in it))),
      shapes: extractShapes(ops, OPS as unknown as OpCodes),
    });
  }
  return pages;
}
