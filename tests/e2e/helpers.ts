import type { Page } from "@playwright/test";

export async function login(page: Page, next = "/admin/forms") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("סיסמה").fill("e2e-password");
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL((u) => u.pathname === next);
}
