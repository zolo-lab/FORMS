import { expect, test } from "@playwright/test";
import { login, newFormFromPdf } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
test.setTimeout(120_000);

test("download the field list as Excel and ask for readable ids", async ({ page }) => {
  await login(page, "/admin/forms");
  await newFormFromPdf(page, `Field list ${Date.now()}`);
  const download = page.waitForEvent("download");
  await page.getByText("כלים", { exact: true }).click();
  await page.getByRole("button", { name: "רשימת השדות (Excel)" }).click();
  expect((await download).suggestedFilename()).toMatch(/שדות\.xlsx$/);
  await page.getByRole("button", { name: "שמות מזהים לשדות" }).click();
  await expect(page.getByText("לכל השדות כבר יש שמות מזהים.")).toBeVisible();
});
