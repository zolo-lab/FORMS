import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false });

test("places, moves and edits stamps on a PDF page", async ({ page }) => {
  await login(page, "/preview/pdf-placement");
  const pdfPage = page.getByTestId("pdf-page-0");
  await expect(pdfPage.locator("canvas")).toBeVisible({ timeout: 20_000 });

  const mapping = async () => JSON.parse((await page.getByTestId("mapping").textContent())!) as { fieldId: string; part?: string; x: number; y: number; width: number; height: number; page: number }[];
  expect(await mapping()).toEqual([]);

  // Click-to-place puts a stamp in the middle of the page (A4: 595.28 x 841.89 pt).
  await page.getByRole("button", { name: "מיקום שם פרטי טקסט" }).click();
  const stamps = await mapping();
  expect(stamps).toHaveLength(1);
  expect(stamps[0]!.fieldId).toBe("firstName");
  expect(stamps[0]!.x).toBeCloseTo((595.28 - 120) / 2, 0);
  expect(stamps[0]!.y).toBeCloseTo(841.89 / 2, 0);

  // Dragging by 100px right and 50px up at 100% zoom moves it by 100pt / 50pt in PDF space.
  const box = (await page.locator("[data-stamp]").first().boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y - 42, { steps: 6 });
  await page.mouse.up();
  const moved = (await mapping())[0]!;
  expect(moved.x - stamps[0]!.x).toBeCloseTo(100, 0);
  expect(moved.y - stamps[0]!.y).toBeCloseTo(50, 0);

  // Composite and table items map to their own keys.
  await page.getByRole("button", { name: "מיקום כתובת יישוב" }).click();
  await page.getByRole("button", { name: /מיקום ילדים · שורה 1 · שם טקסט/ }).click();
  await page.getByRole("button", { name: /מיקום שנישואין|מיקום מצב משפחתי X ליד/ }).first().click();
  const keys = (await mapping()).map((s) => `${s.fieldId}${s.part ? "." + s.part : ""}`);
  expect(keys).toEqual(expect.arrayContaining(["firstName", "address.city", "children[0].name", "maritalStatus"]));

  // Keyboard nudge and delete work on the selected stamp.
  const before = (await mapping()).length;
  await page.keyboard.press("Delete");
  expect((await mapping()).length).toBe(before - 1);
});
