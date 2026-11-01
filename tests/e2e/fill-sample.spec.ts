import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("anonymous users are redirected to /login", async ({ page }) => {
  await page.goto("/preview/sample");
  await expect(page).toHaveURL(/\/login/);
});

test("fills the sample form end to end on mobile", async ({ page }) => {
  await login(page, "/preview/sample");

  // Page 1: empty "next" shows required errors and stays on the page.
  await page.getByRole("button", { name: "הבא" }).click();
  await expect(page.getByText("שדה חובה").first()).toBeVisible();
  await expect(page.getByText("עמוד 1 מתוך 2")).toBeVisible();

  await page.getByLabel("שם פרטי").fill("ישראל");
  await page.getByLabel("שם משפחה").fill("זולו");
  await page.getByLabel("מספר זהות").fill("123456789");
  await page.getByLabel("מספר זהות").blur();
  await expect(page.getByText("מספר תעודת זהות לא תקין")).toBeVisible();
  await page.getByLabel("מספר זהות").fill("000000018");
  await page.getByLabel("תאריך לידה").fill("1990-05-01");
  await page.getByLabel("טלפון נייד").fill("0501234567");
  await page.getByLabel("יישוב").fill("בית שאן");
  await page.getByLabel("רחוב").fill("הרצל");
  await page.getByLabel("מספר בית").fill("12");

  // Conditional field appears only for "married".
  await expect(page.getByLabel("שם בן/בת הזוג")).toHaveCount(0);
  await page.getByLabel("נשוי/אה").check();
  await expect(page.getByLabel("שם בן/בת הזוג")).toBeVisible();
  await page.getByLabel("רווק/ה").check();
  await expect(page.getByLabel("שם בן/בת הזוג")).toHaveCount(0);

  // Repeating table appears for "yes", seeded with the minimum row.
  const yesNo = page.getByRole("radiogroup").filter({ hasText: "כן" }).filter({ hasText: "לא" });
  await yesNo.getByLabel("כן", { exact: true }).check();
  await expect(page.getByText("ילדים 1")).toBeVisible();
  await page.getByRole("button", { name: "הוספת שורה" }).click();
  await expect(page.getByText("ילדים 2")).toBeVisible();
  await page.getByRole("button", { name: "מחיקת שורה 2" }).click();
  await expect(page.getByText("ילדים 2")).toHaveCount(0);
  await yesNo.getByLabel("לא", { exact: true }).check();

  await page.getByRole("button", { name: "הבא" }).click();
  await expect(page.getByText("עמוד 2 מתוך 2")).toBeVisible();

  // Page 2
  await page.getByLabel("שכר חודשי").fill("8500");
  await page.getByLabel("אחוז משרה").fill("50");
  await page.getByLabel("משכורת חודש").check();
  await page.getByLabel("בנק", { exact: true }).selectOption("10");
  await page.getByLabel("סניף").fill("912");
  await page.getByLabel("מספר חשבון").fill("12345678");
  await page.getByLabel("אני מצהיר/ה שהפרטים נכונים").check();

  // Submitting without a signature shows the signature error.
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText("נדרשת חתימה").first()).toBeVisible();

  await page.getByRole("button", { name: "חתימה", exact: true }).click();
  const canvas = page.getByLabel("אזור חתימה");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 8 });
  await page.mouse.move(box.x + 200, box.y + 50, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "שמירת חתימה" }).click();
  await expect(page.getByAltText("החתימה שלך")).toBeVisible();

  await page.getByRole("button", { name: "שליחה" }).click();
  const result = page.getByTestId("result");
  await expect(result).toBeVisible();
  const json = JSON.parse((await result.textContent())!);
  expect(json.firstName).toBe("ישראל");
  expect(json.idNumber).toBe("000000018");
  expect(json.address.city).toBe("בית שאן");
  expect(json.bank).toEqual({ bank: "10", branch: "912", account: "12345678" });
  expect(json.sig.image).toMatch(/^data:image\/png;base64,/);
  expect(json.spouseName).toBeUndefined();
});
