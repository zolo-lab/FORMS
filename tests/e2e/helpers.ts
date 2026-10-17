import type { Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

export async function login(page: Page, next = "/admin/forms") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("סיסמה").fill("e2e-password");
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL((u) => u.pathname === next);
}

/** On phones the builder palette sits in a closed drawer under the canvas; open it before picking a field type. */
export async function openPalette(page: Page) {
  const drawer = page.getByRole("group").filter({ has: page.locator("summary", { hasText: "הוספת שדה" }) }).or(page.locator("details", { has: page.locator("summary", { hasText: "הוספת שדה" }) }));
  const summary = drawer.locator("summary").first();
  if (await summary.isVisible()) {
    const open = await drawer.first().evaluate((el) => (el as HTMLDetailsElement).open);
    if (!open) await summary.click();
  }
}

/** A one-page PDF with a line of text and nothing to detect. */
export async function plainPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595.28, 841.89]).drawText("Plain test document", { x: 50, y: 760, size: 12, font });
  return Buffer.from(await doc.save());
}

/** Every form starts from a PDF: create one through the "טופס חדש" card and return its id (the PDF tab is open). */
export async function newFormFromPdf(page: Page, title: string, pdf?: Buffer): Promise<string> {
  await page.goto("/admin/forms");
  await page.getByPlaceholder("שם הטופס החדש").fill(title);
  await page.locator("#new-form-pdf").setInputFiles({ name: "source.pdf", mimeType: "application/pdf", buffer: pdf ?? (await plainPdf()) });
  await page.getByRole("button", { name: "יצירת הטופס" }).click();
  await page.waitForURL(/\/admin\/forms\/[0-9a-f-]{36}\?tab=pdf/, { timeout: 45_000 });
  return new URL(page.url()).pathname.split("/").pop()!;
}
