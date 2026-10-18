/* eslint-disable @typescript-eslint/no-explicit-any */
import { it } from "vitest";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractShapes, type OpCodes } from "@/lib/pdf/geometry";
import { groupLabels, splitGlyphs, textItems } from "@/lib/pdf/labels";
import { detectFields } from "@/lib/pdf/detect";

it("101 detect", async () => {
  const res = await fetch("https://www.gov.il/BlobFolder/service/itc101/he/Service_Pages_Income_tax_annual-report-2024_itc101.pdf");
  const doc = await getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
  const pages: any[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const [c, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
    const { items, squares } = splitGlyphs(textItems(c.items.filter((it: any) => "str" in it) as any));
    const sh = extractShapes(ops, OPS as unknown as OpCodes);
    pages.push({ index: i, width: page.view[2]!, height: page.view[3]!, labels: groupLabels(i, items), shapes: { ...sh, checkboxes: [...sh.checkboxes, ...squares] } });
  }
  const f = detectFields(pages);
  const r = (n: number) => Math.round(n);
  console.log("PROBE-REPORT\nDETECTED " + f.length + "\n" + f.map((x) => `${x.page} ${x.type} ${x.key ?? "-"} ${JSON.stringify(x.label)} @${r(x.box.x)},${r(x.box.y)} ${r(x.box.width)}x${r(x.box.height)}${x.options ? " [" + x.options.map((o) => o.label).join(" / ") + "]" : ""}${x.columns ? " COLS[" + x.columns.map((c) => `${c.key}:${c.type}@${r(c.x)}+${r(c.width)}`).join(" ") + "] ROWS " + x.rows!.length : ""}`).join("\n") + "\nEND-PROBE");
}, 120000);
