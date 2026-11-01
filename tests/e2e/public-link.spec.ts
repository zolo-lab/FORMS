import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("a form's own link opens the form itself on its first step, for anyone", async ({ page, context }) => {
  await login(page, "/admin/forms");
  const open = page.getByRole("link", { name: "פתיחת הקישור למילוי – קליטת עובד רגיל" });
  await expect(open).toBeVisible();
  const href = await open.getAttribute("href");
  expect(href).toMatch(/^\/f\/[0-9a-f-]{36}$/);

  // Anyone with the link, not logged in: straight to the form, no page of details before it.
  await context.clearCookies();
  await page.goto(href!);
  await expect(page.getByRole("button", { name: "שליחה" }).first()).toBeVisible();
  await expect(page.getByText("המשך למילוי")).toHaveCount(0);
  await expect(page.getByLabel("שם מלא *")).toHaveCount(0);
});

test("a link to a form that does not exist is not found", async ({ page }) => {
  const res = await page.goto("/f/00000000-0000-0000-0000-000000000000");
  expect(res?.status()).toBe(404);
});
