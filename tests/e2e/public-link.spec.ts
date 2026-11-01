import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("a form's own link opens the form itself on its first step, for anyone", async ({ page, context }) => {
  await login(page, "/admin/forms");
  // A form open to several organizations has a link per organization, in a short list.
  const list = page.getByLabel("קישורים למילוי – קליטת עובד רגיל");
  const several = (await list.count()) > 0;
  if (several) await list.click();
  const open = page.getByRole("link", { name: /^פתיחת הקישור למילוי – קליטת עובד רגיל/ }).first();
  await expect(open).toBeVisible();
  const href = (await open.getAttribute("href"))!;
  expect(href).toMatch(/^\/f\/[0-9a-f-]{36}(\/[a-z0-9-]+)?$/);

  // Anyone with the link, not logged in: straight to the form, no page of details before it.
  await context.clearCookies();
  await page.goto(href);
  // The form itself (a form of several pages shows "הבא" first, the last one "שליחה").
  await expect(page.getByRole("button", { name: /^(שליחה|הבא)$/ }).first()).toBeVisible();
  await expect(page.getByText("המשך למילוי")).toHaveCount(0);
  await expect(page.getByLabel("שם מלא *")).toHaveCount(0);

  if (several) {
    // Without the organization, a form of several organizations does not open.
    await page.goto(href.replace(/\/[a-z0-9-]+$/, ""));
    await expect(page.getByText("צריך את הקישור של העמותה שלכם")).toBeVisible();
    await expect(page.getByRole("button", { name: /^(שליחה|הבא)$/ })).toHaveCount(0);
    // And a link of an organization the form is not open to says so.
    await page.goto(`${href.replace(/\/[a-z0-9-]+$/, "")}/no-such-org`);
    await expect(page.getByText("הקישור הזה לא פתוח לעמותה הזו")).toBeVisible();
  }
});

test("a link to a form that does not exist is not found", async ({ page }) => {
  const res = await page.goto("/f/00000000-0000-0000-0000-000000000000");
  expect(res?.status()).toBe(404);
});
