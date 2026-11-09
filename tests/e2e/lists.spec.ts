import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

// The desktop table and the phone cards both render; only one is visible at a time.
const visible = "visible=true";

test("lists: a type with a choice field, a list filled and saved, then the type deleted", async ({ page }) => {
  await login(page, "/admin/lists");
  await expect(page.getByRole("heading", { name: "רשימות", level: 1 })).toBeVisible();
  // The organizations are the built-in type, shown first.
  await expect(page.getByRole("heading", { name: "עמותות ועסקים", level: 2 })).toBeVisible();

  const type = `סוג בדיקה ${Date.now()}`;
  await page.getByRole("button", { name: "סוג רשימה" }).click();
  const create = page.getByRole("dialog", { name: "סוג רשימה חדש" });
  await create.getByLabel("שם הסוג").fill(type);
  await create.getByRole("button", { name: "יצירה" }).click();
  await expect(page.getByRole("heading", { name: type, level: 2 })).toBeVisible();

  // A choice field, its options typed line by line.
  await page.getByRole("button", { name: "שדה", exact: true }).click();
  const add = page.getByRole("dialog", { name: "שדה חדש" });
  await add.getByLabel("שם השדה").fill("אזור");
  await add.getByLabel("סוג").selectOption("select");
  // A column pasted from Excel: every line an option.
  await add.getByLabel("אפשרות 1", { exact: true }).evaluate((el) => {
    const d = new DataTransfer();
    d.setData("text/plain", "צפון\r\nדרום\r\n");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: d, bubbles: true, cancelable: true }));
  });
  await expect(add.getByLabel("אפשרות 2", { exact: true })).toHaveValue("דרום");
  await add.getByRole("button", { name: "הוספה" }).click();
  await expect(add).toBeHidden();

  await page.getByRole("button", { name: "רשומה", exact: true }).click();
  const name = page.getByLabel("שם – ללא שם").locator(visible);
  await name.fill("סניף בדיקה");
  await name.blur();
  await expect(page.getByText(/כל השינויים נשמרו/)).toBeVisible();
  // The choice is picked in a panel under the cell, which also adds an option to the field on the spot.
  const region = page.getByRole("button", { name: "אזור – סניף בדיקה" }).locator(visible);
  await region.click();
  const panel = page.getByRole("group", { name: "אזור – סניף בדיקה" });
  await panel.getByLabel("אפשרות חדשה לאזור").fill("מרכז");
  await panel.getByRole("button", { name: "הוספת האפשרות" }).click();
  await expect(region).toHaveText("מרכז");
  await expect(page.getByText(/כל השינויים נשמרו/)).toBeVisible();
  // A record offers a set of options: ticking another keeps the first.
  if (!(await panel.isVisible())) await region.click();
  await panel.getByRole("checkbox", { name: "דרום" }).check();
  await expect(region).toHaveText("דרום, מרכז");
  await expect(page.getByText(/כל השינויים נשמרו/)).toBeVisible();

  // The field's settings: which options each record offers, in one grid.
  await page.getByRole("button", { name: "אזור", exact: true }).locator(visible).click();
  const settings = page.getByRole("dialog", { name: 'השדה "אזור"' });
  // The option added from the cell reaches the grid with the refreshed sheet.
  await expect(settings.getByRole("columnheader", { name: /מרכז/ })).toBeVisible();
  await expect(settings.getByLabel("אזור: דרום – סניף בדיקה")).toBeChecked();
  await expect(settings.getByLabel("אזור: מרכז – סניף בדיקה")).toBeChecked();
  await settings.getByLabel("אזור: מרכז – סניף בדיקה").uncheck();
  await settings.getByRole("button", { name: "שמירה" }).click();
  await expect(settings).toBeHidden();
  await expect(region).toHaveText("דרום");

  // A text field turned into a choice keeps its values, and they become its options.
  await page.getByRole("button", { name: "שדה", exact: true }).click();
  await add.getByLabel("שם השדה").fill("צבע");
  await add.getByRole("button", { name: "הוספה" }).click();
  await expect(add).toBeHidden();
  const color = page.getByLabel("צבע – סניף בדיקה").locator(visible);
  await color.fill("אדום");
  await color.blur();
  await expect(page.getByText(/כל השינויים נשמרו/)).toBeVisible();
  await page.getByRole("button", { name: "צבע", exact: true }).locator(visible).click();
  const colorSettings = page.getByRole("dialog", { name: 'השדה "צבע"' });
  await colorSettings.getByLabel("סוג").selectOption("select");
  await colorSettings.getByRole("button", { name: "שמירה" }).click();
  await expect(colorSettings).toBeHidden();
  await expect(page.getByRole("button", { name: "צבע – סניף בדיקה" }).locator(visible)).toHaveText("אדום");

  // It stays after a reload.
  await page.reload();
  await expect(page.getByRole("button", { name: "אזור – סניף בדיקה" }).locator(visible)).toHaveText("דרום");

  await page.getByRole("button", { name: "מחיקת הסוג" }).click();
  const del = page.getByRole("dialog", { name: `מחיקת "${type}"` });
  await expect(del.getByText("רשומה אחת תימחק")).toBeVisible();
  await del.getByRole("button", { name: "מחיקה" }).click();
  await expect(page.getByRole("heading", { name: "עמותות ועסקים", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(type) })).toHaveCount(0);
});
