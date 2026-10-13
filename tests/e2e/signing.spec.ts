import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("an unknown signing link shows a clear message and no form", async ({ page }) => {
  await page.goto(`/s/${"a".repeat(43)}`);
  await expect(page.getByRole("heading", { name: "הקישור אינו תקין" })).toBeVisible();
  await expect(page.getByRole("button", { name: /שליחה|חתימה|המשך/ })).toHaveCount(0);
});

test("a malformed signing link is rejected the same way", async ({ page }) => {
  await page.goto("/s/not-a-real-token");
  await expect(page.getByRole("heading", { name: "הקישור אינו תקין" })).toBeVisible();
});

test.describe("with a real request", () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

  test("the employee link opens without logging in and names the employee", async ({ page, browser }) => {
    await login(page, "/admin/requests/new");
    await page.getByLabel("ערכת מסמכים").selectOption({ label: "קליטת עובד רגיל" });
    await page.getByRole("button", { name: "הבא" }).click();
    const name = `חתימה e2e ${Date.now()}`;
    await page.getByLabel("שם העובד").fill(name);
    await page.getByLabel("מייל").fill("e2e-sign@example.invalid");
    await page.getByLabel("טלפון נייד").fill("050-123-4567");
    await page.getByRole("button", { name: "הבא" }).click();
    const next = page.getByRole("button", { name: "הבא" });
    if (await next.isVisible()) await next.click();
    await page.getByRole("button", { name: "שליחה" }).click();
    const done = page.getByTestId("request-done");
    await expect(done.getByRole("heading", { name: "הבקשה נשלחה" })).toBeVisible({ timeout: 30_000 });
    const url = await done.getByLabel(/קישור ל/).first().inputValue();

    // A fresh browser context: no admin cookie, exactly what the employee has.
    const ctx = await browser.newContext({ baseURL: new URL(url).origin });
    const guest = await ctx.newPage();
    await guest.goto(new URL(url).pathname);
    await expect(guest.getByText(`עבור: ${name}`).or(guest.getByRole("button", { name: /שלחו קוד|קוד אימות/ }))).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });
});
