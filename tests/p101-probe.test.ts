/* eslint-disable @typescript-eslint/no-explicit-any */
import { it } from "vitest";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractShapes, type OpCodes } from "@/lib/pdf/geometry";
import { groupLabels, textItems } from "@/lib/pdf/labels";

it("101 raw", async () => {
  const res = await fetch("https://www.gov.il/BlobFolder/service/itc101/he/Service_Pages_Income_tax_annual-report-2024_itc101.pdf");
  const doc = await getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const [c, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
    const sh = extractShapes(ops, OPS as unknown as OpCodes);
    const labels = groupLabels(i, textItems(c.items.filter((it: any) => "str" in it) as any));
    const r = (n: number) => Math.round(n);
    out.push(`PAGE ${i} size ${r(page.view[2]!)}x${r(page.view[3]!)}`);
    out.push("LINES " + sh.lines.map((l: any) => `${r(l.x1)}-${r(l.x2)}@${r(l.y)}`).join(" "));
    out.push("BOXES " + sh.boxes.map((b: any) => `${r(b.x)},${r(b.y)} ${r(b.width)}x${r(b.height)}`).join(" | "));
    out.push("CHECKS " + sh.checkboxes.length + " COMBS " + sh.combs.length);
    for (const l of labels) out.push(`L ${r(l.x)},${r(l.y)} w${r(l.width)} h${r(l.height)} ${JSON.stringify(l.str)}`);
  }
  throw new Error("PROBE-REPORT\n" + out.join("\n") + "\nEND-PROBE");
}, 120000);
