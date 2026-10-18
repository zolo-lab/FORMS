/* eslint-disable @typescript-eslint/no-explicit-any */
import { it } from "vitest";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractShapes, type OpCodes } from "@/lib/pdf/geometry";
import { groupLabels, splitGlyphs, textItems } from "@/lib/pdf/labels";
import { detectFields } from "@/lib/pdf/detect";
import { detectFields as detectOld } from "@/lib/pdf/detect-old";

it("101 compare", async () => {
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
  const now = detectFields(pages);
  const old = detectOld(pages);
  const key = (f: any) => `${f.page}|${f.label}|${f.type}`;
  const nowKeys = new Set(now.map(key));
  const oldKeys = new Set(old.map(key));
  const out = [`NOW ${now.length} OLD ${old.length}`, "--- in OLD only"];
  for (const f of old) if (!nowKeys.has(key(f))) out.push(`${f.page} ${f.type} ${f.label} @${Math.round(f.box.x)},${Math.round(f.box.y)} ${Math.round(f.box.width)}x${Math.round(f.box.height)}`);
  out.push("--- in NOW only");
  for (const f of now) if (!oldKeys.has(key(f))) out.push(`${f.page} ${f.type} ${f.label}`);
  throw new Error("PROBE-REPORT\n" + out.join("\n") + "\nEND-PROBE");
}, 120000);
