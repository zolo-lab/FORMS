/* eslint-disable @typescript-eslint/no-explicit-any */
import { it } from "vitest";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractShapes, type OpCodes } from "@/lib/pdf/geometry";
import { groupLabels, textItems } from "@/lib/pdf/labels";
import { detectFields } from "@/lib/pdf/detect";

it("101", async () => {
  const res = await fetch("https://www.gov.il/BlobFolder/service/itc101/he/Service_Pages_Income_tax_annual-report-2024_itc101.pdf");
  const data = new Uint8Array(await res.arrayBuffer());
  const doc = await getDocument({ data }).promise;
  const pages = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const [c, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
    pages.push({ index: i, width: page.view[2]! - page.view[0]!, height: page.view[3]! - page.view[1]!,
      labels: groupLabels(i, textItems(c.items.filter((it: any) => "str" in it) as any)),
      shapes: extractShapes(ops, OPS as unknown as OpCodes) });
  }
  console.log("PAGES", pages.map((p) => ({ labels: p.labels.length, lines: p.shapes.lines.length, boxes: p.shapes.boxes.length, combs: p.shapes.combs.length, cbs: p.shapes.checkboxes.length })));
  const f = detectFields(pages as any);
  const lines = f.map((x) => [x.page, x.type, JSON.stringify(x.label), x.options?.length ?? ""].join(" | "));
  throw new Error("PROBE-REPORT\nDETECTED " + f.length + "\n" + lines.join("\n") + "\nEND-PROBE");
}, 120000);
