import { expect, test } from "@playwright/test";
import { login, newFormFromPdf } from "./helpers";

// Every form starts from a PDF: duplicate keeps it, tabs lead with the document.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
test.setTimeout(180_000);

test("PDF-first: tab order and duplicate keeps the document", async ({ page }) => {
  await login(page, "/admin/forms");
  const title = `PDF first ${Date.now()}`;
  await newFormFromPdf(page, title);
  await expect(page.getByText(/source\.pdf/)).toBeVisible({ timeout: 30_000 });
  const tabs = await page.getByRole("tab").allTextContents();
  expect(tabs[0]).toContain("מסמך PDF");
  expect(tabs[1]).toContain("עריכה");
  await expect(page.getByRole("button", { name: "הסרת ה-PDF מהטופס" })).toHaveCount(0);

  await page.goto("/admin/forms");
  const row = page.locator("li, tr, div").filter({ hasText: title }).filter({ has: page.getByRole("button", { name: "שכפול" }) }).last();
  await row.getByRole("button", { name: "שכפול" }).click();
  await page.waitForURL(/\/admin\/forms\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await page.getByRole("tab", { name: "מסמך PDF" }).click();
  await expect(page.getByText(/source\.pdf/)).toBeVisible({ timeout: 30_000 });
});
