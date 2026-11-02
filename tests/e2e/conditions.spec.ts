import { expect, test } from "@playwright/test";
import { login, newFormFromPdf } from "./helpers";

// Israel, 2.11: "when this box is ticked / this field is filled, open those fields" – set from the source field by
// typing the target's name, and working in the filled form.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
test.setTimeout(180_000);

test("a ticked box and a filled field open other fields; hidden ones are not required", async ({ page }) => {
  await login(page, "/admin/forms");
  const id = await newFormFromPdf(page, `תנאים e2e ${Date.now()}`);
  await page.getByRole("tab", { name: "רספונסיבי" }).click();
  const palette = page.getByRole("button", { name: /^(תשובה קצרה|תאריך|סכום \(₪\)|הצהרה \/ אישור)$/ });
  const quick = page.getByRole("group", { name: "עריכה מהירה" }).or(page.locator('[aria-label="עריכה מהירה"]'));
  const add = async (type: string, label: string) => {
    await palette.filter({ hasText: type }).first().click();
    await quick.getByLabel("תווית השדה").fill(label);
  };
  await add("הצהרה / אישור", "תושב יישוב מזכה");
  await add("תאריך", "מתאריך");
  await add("תשובה קצרה", "שם היישוב");
  await add("תשובה קצרה", "הכנסה נוספת");
  await add("סכום (₪)", "סכום ההכנסה הנוספת");
  await page.getByRole("switch", { name: "שדה חובה" }).click();

  // From the box: "when this is ticked – show also" + type the field's name.
  await page.getByRole("button", { name: /^תושב יישוב מזכה/ }).first().click();
  await expect(page.getByText("כשהשדה הזה מסומן – הצג גם:")).toBeVisible();
  const opens = page.getByRole("combobox", { name: "הוספת שדה שנפתח" });
  await opens.fill("מתאריך");
  await opens.press("Enter");
  await expect(page.getByRole("list", { name: "שדות שנפתחים מהשדה הזה" })).toContainText("מתאריך");

  // Or mark them on the form: "סימון בטופס", tick, save.
  await page.getByRole("button", { name: "סימון בטופס או על המסמך" }).click();
  const bar = page.getByRole("region", { name: "סימון שדות שנפתחים" });
  await expect(bar).toContainText("1 מסומנים");
  await page.getByRole("checkbox", { name: "שם היישוב נפתח מהשדה המסומן" }).check();
  await expect(bar).toContainText("2 מסומנים");
  await bar.getByRole("button", { name: "שמירה" }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole("list", { name: "שדות שנפתחים מהשדה הזה" })).toContainText("שם היישוב");

  // From a text field: "when this is filled – show also".
  await page.getByRole("button", { name: /^הכנסה נוספת/ }).first().click();
  await expect(page.getByText("כשהשדה הזה מלא – הצג גם:")).toBeVisible();
  await opens.fill("סכום ההכנסה הנוספת");
  await opens.press("Enter");
  await expect(page.getByRole("list", { name: "שדות שנפתחים מהשדה הזה" })).toContainText("סכום ההכנסה הנוספת");

  // The target shows its condition in its own settings, as "filled" / "ticked".
  await page.getByRole("button", { name: /^מתאריך/ }).first().click();
  await expect(page.getByRole("combobox", { name: "פעולה" }).first()).toHaveValue("eq");

  await page.waitForTimeout(1500);
  await expect(page.getByText("נשמר", { exact: true })).toBeVisible({ timeout: 20_000 });

  // Filling: hidden until ticked / filled.
  await page.goto(`/preview/form/${id}?all=1`);
  await expect(page.getByLabel("הכנסה נוספת")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("מתאריך")).toHaveCount(0);
  await expect(page.getByLabel("שם היישוב")).toHaveCount(0);
  await expect(page.getByLabel("סכום ההכנסה הנוספת")).toHaveCount(0);
  await page.getByLabel("תושב יישוב מזכה").check();
  await expect(page.getByLabel("מתאריך")).toBeVisible();
  await expect(page.getByLabel("שם היישוב")).toBeVisible();
  await page.getByLabel("תושב יישוב מזכה").uncheck();
  await expect(page.getByLabel("מתאריך")).toHaveCount(0);

  // A hidden required field does not block sending (the declaration box itself is required by default: tick it).
  await page.getByLabel("תושב יישוב מזכה").check();
  await page.getByRole("button", { name: "שליחה" }).click();
  await page.getByText("התשובות כפי שנשמרות (JSON)").click();
  await expect(page.getByTestId("result")).toBeVisible();

  // Once shown, it is required.
  await page.goto(`/preview/form/${id}?all=1`);
  await page.getByLabel("תושב יישוב מזכה").check();
  await page.getByLabel("הכנסה נוספת").fill("שכירות");
  await expect(page.getByLabel("סכום ההכנסה הנוספת")).toBeVisible();
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText("שדה חובה").first()).toBeVisible();
  await expect(page.getByTestId("result")).toHaveCount(0);
});
