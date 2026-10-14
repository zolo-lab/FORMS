import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Needs the dev database (seeded package + organizations); skipped when DATABASE_URL is not provided.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("creates a request and shows a copyable link plus a WhatsApp share link", async ({ page }) => {
  await login(page, "/admin/requests/new");

  await expect(page.getByRole("heading", { name: "בקשה חדשה" })).toBeVisible();
  // The dev DB also holds throwaway packages from parallel DB tests: pick the seeded one explicitly.
  await page.getByLabel("ערכת מסמכים").selectOption({ label: "קליטת עובד רגיל" });
  await page.getByRole("button", { name: "הבא" }).click();

  // Step 2 validates the name before moving on.
  await page.getByRole("button", { name: "הבא" }).click();
  await expect(page.getByText("שדה חובה")).toBeVisible();

  const name = `בדיקת e2e ${Date.now()}`;
  await page.getByLabel("שם העובד").fill(name);
  await page.getByLabel("מייל").fill("e2e-wizard@example.invalid");
  await page.getByLabel("טלפון נייד").fill("050-123-4567");
  await page.getByRole("button", { name: "הבא" }).click();

  // Step 3 (requester fields) → step 4 (summary).
  const next = page.getByRole("button", { name: "הבא" });
  if (await next.isVisible()) await next.click();
  await expect(page.getByText("מסלול החתימות")).toBeVisible();
  await page.getByRole("button", { name: "שליחה" }).click();

  const done = page.getByTestId("request-done");
  // Sending creates tokens, outbox rows and events one by one on a remote DB: allow it time.
  try {
    await expect(done.getByRole("heading", { name: "הבקשה נשלחה" })).toBeVisible({ timeout: 30_000 });
  } catch (e) {
    // CI artifacts cannot be downloaded here: put what the page shows into the failure message.
    throw new Error(`${(e as Error).message}\nPAGE: ${(await page.locator("body").innerText()).slice(0, 1500)}`);
  }
  const link = done.getByLabel(/קישור ל/).first();
  await expect(link).toHaveValue(/\/s\/[A-Za-z0-9_-]{43}$/);
  await expect(done.getByRole("link", { name: "שתף בוואטסאפ" }).first()).toHaveAttribute("href", /^https:\/\/wa\.me\/972501234567\?text=/);

  await done.getByRole("link", { name: "לעמוד הבקשה" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("בתהליך")).toBeVisible();
});
