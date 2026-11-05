import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { cutPages } from "@/lib/pdf/cut";

/** A PDF whose pages have distinct sizes, so a cut can be checked by which pages came through. */
async function sample(count: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([200 + i, 400]);
  return doc.save();
}

const widths = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));

describe("cutPages", () => {
  it("takes exactly the pages named, in order", async () => {
    const src = await sample(5);
    expect(await widths(await cutPages(src, "1"))).toEqual([200]);
    expect(await widths(await cutPages(src, "2-3"))).toEqual([201, 202]);
    expect(await widths(await cutPages(src, "1,5"))).toEqual([200, 204]);
  });

  it("reads an open range as 'to the end of this document'", async () => {
    expect(await widths(await cutPages(await sample(4), "3-"))).toEqual([202, 203]);
  });

  it("sorts and de-duplicates, so the part is a sane document", async () => {
    expect(await widths(await cutPages(await sample(4), "3,1,3"))).toEqual([200, 202]);
  });

  it("leaves the source untouched", async () => {
    const src = await sample(3);
    await cutPages(src, "2");
    expect(await widths(src)).toEqual([200, 201, 202]);
  });

  it("refuses a range outside the document instead of filing a wrong part", async () => {
    await expect(cutPages(await sample(2), "5")).rejects.toThrow(/2 עמודים/);
    await expect(cutPages(await sample(2), "")).rejects.toThrow(/לא נבחרו עמודים/);
    await expect(cutPages(await sample(2), "abc")).rejects.toThrow(/לא מספר עמוד/);
  });
});

describe("cutPages with a certificate page at the end", () => {
  it("stops an open range at the end of the form, not at the certificate", async () => {
    // 4 pages of form + 1 certificate page, as a signed document looks.
    const doc = await PDFDocument.create();
    for (let i = 0; i < 5; i++) doc.addPage([200 + i, 400]);
    const signed = await doc.save();
    expect(await widths(await cutPages(signed, "3-", 4))).toEqual([202, 203]);
    // Without the hint the certificate would come along.
    expect(await widths(await cutPages(signed, "3-"))).toEqual([202, 203, 204]);
  });

  it("still refuses a range past the form's own length", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 5; i++) doc.addPage([200 + i, 400]);
    await expect(cutPages(await doc.save(), "5", 4)).rejects.toThrow(/4 עמודים/);
  });
});
