import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("organizations: a table, editing in a side panel, a project added and deleted", async ({ page }) => {
  await login(page, "/admin/settings/organizations");
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "שם" })).toBeVisible();
  const first = table.locator("tbody tr").first();
  const name = (await first.locator("td").nth(1).innerText()).trim();
  await first.getByRole("link", { name: `עריכה – ${name}` }).click();
  const panel = page.getByRole("dialog", { name });
  await expect(panel.getByRole("heading", { name: "פרויקטים" })).toBeVisible();

  const project = `פרויקט בדיקה ${Date.now()}`;
  await panel.getByLabel("פרויקט חדש").fill(project);
  await panel.getByRole("button", { name: "הוספה" }).click();
  const added = page.getByRole("dialog", { name }).getByLabel(`שם הפרויקט – ${project}`);
  await expect(added).toBeVisible();
  // Nothing is filed under a new project, so it can be deleted.
  await page.getByRole("dialog", { name }).getByRole("button", { name: `מחיקת הפרויקט ${project}` }).click();
  await expect(page.getByRole("dialog", { name }).getByText("הפרויקט נמחק.")).toBeVisible();
  await expect(page.getByRole("dialog", { name }).getByLabel(`שם הפרויקט – ${project}`)).toHaveCount(0);
});
