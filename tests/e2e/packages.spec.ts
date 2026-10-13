import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Needs the dev database; skipped when DATABASE_URL is not provided.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("create a package, edit its route, validate steps, archive", async ({ page }) => {
  await login(page, "/admin/packages");
  const name = `ערכת e2e ${Date.now()}`;
  await page.getByLabel("שם הערכה החדשה").fill(name);
  await page.getByRole("button", { name: "ערכה חדשה" }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("הוסיפו לפחות טופס אחד")).toBeVisible();

  // New package starts with requester → employee; add a third step and make it payroll.
  await page.getByRole("button", { name: "הוספת שלב" }).click();
  const step3 = page.locator("form").filter({ has: page.locator('input[name="index"][value="2"]') });
  await step3.getByLabel("תפקיד").selectOption("payroll");
  await step3.getByRole("button", { name: "שמירת שלב 3" }).click();
  // A payroll step needs a named assignee.
  await expect(page.getByRole("alert")).toContainText("השלב לא נשמר");

  const again = page.locator("form").filter({ has: page.locator('input[name="index"][value="2"]') });
  await again.getByLabel("תפקיד").selectOption("payroll");
  await again.getByLabel("שם הנמען הקבוע").fill("חשבות שכר");
  await again.getByRole("button", { name: "שמירת שלב 3" }).click();
  await expect(page.getByRole("status").filter({ hasText: "נשמר" })).toBeVisible();
  await expect(page.locator("form").filter({ has: page.locator('input[name="index"][value="2"]') }).getByLabel("תפקיד")).toHaveValue("payroll");

  // Rename + archive.
  await page.getByLabel("שם הערכה", { exact: true }).fill(`${name} (ארכיון)`);
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("heading", { name: `${name} (ארכיון)` })).toBeVisible();
  await page.getByRole("button", { name: "העברה לארכיון" }).click();
  await expect(page).toHaveURL(/\/admin\/packages$/);
  await expect(page.getByText(`${name} (ארכיון)`)).toHaveCount(0);
});
