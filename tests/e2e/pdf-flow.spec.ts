import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { login } from "./helpers";

// builder-plan.md §1.7 (route B): a form built from an existing PDF, iForms-style.
// Needs the dev database; skipped when DATABASE_URL is not provided.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false });

async function samplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  page.drawText("Employee form - name: ________   ID: _________", { x: 50, y: 760, size: 12, font });
  page.drawText("Date: ________   Agree: [ ]   Signature: __________", { x: 50, y: 700, size: 12, font });
  return Buffer.from(await doc.save());
}

test("PDF form: upload, draw five elements, assign a role, publish, attach to a package", async ({ page }) => {
  await login(page, "/admin/forms");
  const title = `PDF e2e ${Date.now()}`;
  await page.getByPlaceholder("שם הטופס החדש").fill(title);
  await page.getByRole("button", { name: "טופס מ-PDF" }).click();
  await page.waitForURL(/\/admin\/forms\/[0-9a-f-]+\?tab=pdf/);

  // Upload a one-page PDF generated on the fly.
  await page.locator('input[type="file"][accept="application/pdf"]').setInputFiles({ name: "sample.pdf", mimeType: "application/pdf", buffer: await samplePdf() });
  await expect(page.getByText(/sample\.pdf · 1 עמודים/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pdf-page-0").locator("canvas")).toBeVisible({ timeout: 20_000 });

  // Five elements from the palette; each lands on its own spot.
  for (const label of ["טקסט", 'ת"ז בתאים', "תאריך", "תיבת סימון", "חתימה"]) {
    await page.getByRole("button", { name: `הוספת ${label}`, exact: true }).click();
  }
  const stamps = page.locator("[data-stamp]");
  await expect(stamps).toHaveCount(5);
  const boxes = await stamps.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)}`; }));
  expect(new Set(boxes).size).toBe(5);
  await expect(page.getByText("5 חותמות ממופות")).toBeVisible();

  // The last element (signature) is selected: give it to the employee.
  await page.getByLabel("מי ממלא").selectOption("employee");

  // The drawn fields live on their own page in the form editor, not among the questions.
  await page.getByRole("tab", { name: "עריכה" }).click();
  await expect(page.getByText("שדות במסמך")).toBeVisible();

  // Publish.
  await page.getByRole("button", { name: "פרסום" }).click();
  await expect(page.getByText("גרסה 1 פורסמה")).toBeVisible({ timeout: 20_000 });

  // Attach to a new package.
  await page.goto("/admin/packages");
  const pkg = `ערכת PDF e2e ${Date.now()}`;
  await page.getByLabel("שם הערכה החדשה").fill(pkg);
  await page.getByRole("button", { name: "ערכה חדשה" }).click();
  await expect(page.getByRole("heading", { name: pkg })).toBeVisible();
  const picker = page.locator("select").filter({ has: page.locator(`option:has-text("${title}")`) }).first();
  await picker.selectOption({ label: title });
  await page.getByRole("button", { name: "הוספת טופס" }).click();
  await expect(page.locator("main").getByText(title).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("הוסיפו לפחות טופס אחד")).toHaveCount(0);
});
