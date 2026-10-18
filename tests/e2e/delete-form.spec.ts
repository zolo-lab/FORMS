import { expect, test } from "@playwright/test";
import { login, newFormFromPdf } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
test.setTimeout(120_000);

test("delete a form from the list after confirming", async ({ page }) => {
  await login(page, "/admin/forms");
  const title = `Delete me ${Date.now()}`;
  await newFormFromPdf(page, title);
  await page.goto("/admin/forms");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.getByRole("button", { name: `מחיקת הטופס ${title}` }).click();
  const dialog = page.getByRole("dialog", { name: "מחיקת הטופס" });
  await expect(dialog.getByText("יימחק לצמיתות")).toBeVisible();
  // Cancel keeps it.
  await dialog.getByRole("button", { name: "ביטול" }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.getByRole("button", { name: `מחיקת הטופס ${title}` }).click();
  await page.getByRole("dialog", { name: "מחיקת הטופס" }).getByRole("button", { name: "מחיקה לצמיתות" }).click();
  await page.waitForURL(/deleted=1/);
  await expect(page.getByText("הטופס נמחק.")).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});
