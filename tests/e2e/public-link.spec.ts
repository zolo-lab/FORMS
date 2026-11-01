import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("a form's own link: details, then the form opens on the signing page", async ({ page, context }) => {
  const n = Date.now();
  await login(page, "/admin/forms");
  const open = page.getByRole("link", { name: "פתיחת הקישור למילוי – קליטת עובד רגיל" });
  await expect(open).toBeVisible();
  const href = await open.getAttribute("href");
  expect(href).toMatch(/^\/f\/[0-9a-f-]{36}$/);

  // Anyone with the link, not logged in.
  await context.clearCookies();
  await page.goto(href!);
  await expect(page.getByRole("heading", { name: "קליטת עובד רגיל" })).toBeVisible();
  await page.getByLabel("שם מלא *").fill(`ציבורי e2e ${n}`);
  await page.getByLabel("מייל *").fill(`e2e-${n}@example.test`);
  const org = page.getByLabel("עמותה *");
  if (await org.isVisible()) await org.selectOption({ index: 1 });
  await page.getByRole("button", { name: "המשך למילוי" }).click();
  await page.waitForURL(/\/s\/[A-Za-z0-9_-]{20,}$/);
  await expect(page.getByText(`ציבורי e2e ${n}`).first()).toBeVisible();
});
