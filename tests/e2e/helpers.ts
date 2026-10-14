import type { Page } from "@playwright/test";

export async function login(page: Page, next = "/admin/forms") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("סיסמה").fill("e2e-password");
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL((u) => u.pathname === next);
}

/** On phones the builder palette sits in a closed drawer under the canvas; open it before picking a field type. */
export async function openPalette(page: Page) {
  const drawer = page.getByRole("group").filter({ has: page.locator("summary", { hasText: "הוספת שדה" }) }).or(page.locator("details", { has: page.locator("summary", { hasText: "הוספת שדה" }) }));
  const summary = drawer.locator("summary").first();
  if (await summary.isVisible()) {
    const open = await drawer.first().evaluate((el) => (el as HTMLDetailsElement).open);
    if (!open) await summary.click();
  }
}
