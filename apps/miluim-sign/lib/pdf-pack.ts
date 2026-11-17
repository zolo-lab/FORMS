import { PDFDocument } from "pdf-lib";

/** One flattened JPEG per page, wrapped as a PDF the officer can download. */
export async function imagesToPdf(pages: Uint8Array[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const bytes of pages) {
    const image = await pdf.embedJpg(bytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  pdf.setTitle("כתב הסכמה חתום");
  pdf.setProducer("miluim-sign");
  return pdf.save();
}
