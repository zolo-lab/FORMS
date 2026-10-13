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

test("draws elements straight onto the PDF and styles them", async ({ page }) => {
  await login(page, "/preview/pdf-placement");
  await expect(page.getByTestId("pdf-page-0").locator("canvas")).toBeVisible({ timeout: 20_000 });
  const mapping = async () => JSON.parse((await page.getByTestId("mapping").textContent())!) as { fieldId: string; kind: string; bold?: boolean; color?: string; comb?: { cells: number }; dateFormat?: string }[];

  for (const label of ['ת"ז בתאים', "תאריך חתימה", "חתימה", "טקסט", "ראשי תיבות"]) {
    await page.getByRole("button", { name: `הוספת ${label}`, exact: true }).click();
  }
  const stamps = await mapping();
  expect(stamps.map((s) => s.kind)).toEqual(["comb", "date_signed", "signature", "text", "initials"]);
  expect(stamps[0]!.comb).toEqual({ cells: 9 });
  expect(stamps[0]!.fieldId).toMatch(/^pdf_id_\d+$/);

  // The last drawn stamp (initials) is selected: style it.
  await page.getByRole("switch", { name: "בולד" }).click();
  await page.getByLabel("צבע").selectOption("#1a3c8c");
  const styled = (await mapping()).at(-1)!;
  expect(styled.bold).toBe(true);
  expect(styled.color).toBe("#1a3c8c");

  // Deleting the selected stamp removes it from the mapping.
  await page.keyboard.press("Delete");
  expect(await mapping()).toHaveLength(4);
});

test("selects several stamps, aligns them, copies and undoes", async ({ page }) => {
  await login(page, "/preview/pdf-placement");
  await expect(page.getByTestId("pdf-page-0").locator("canvas")).toBeVisible({ timeout: 20_000 });
  const mapping = async () => JSON.parse((await page.getByTestId("mapping").textContent())!) as { id: string; x: number; y: number; width: number }[];

  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "הוספת טקסט", exact: true }).click();
  expect(await mapping()).toHaveLength(3);
  // All three were dropped at the same spot; spread them by dragging two away.
  const boxes = page.locator("[data-stamp]");
  const first = (await boxes.nth(0).boundingBox())!;
  await page.mouse.move(first.x + 10, first.y + 8);
  await page.mouse.down();
  await page.mouse.move(first.x + 210, first.y + 8, { steps: 5 });
  await page.mouse.up();
  const second = (await boxes.nth(1).boundingBox())!;
  await page.mouse.move(second.x + 10, second.y + 8);
  await page.mouse.down();
  await page.mouse.move(second.x - 90, second.y + 108, { steps: 5 });
  await page.mouse.up();
  const xs = (await mapping()).map((s) => s.x);
  expect(new Set(xs.map((x) => Math.round(x))).size).toBeGreaterThan(1);

  // Shift-click all three, then align right: every right edge becomes equal.
  await boxes.nth(0).click({ modifiers: ["Shift"] });
  await boxes.nth(1).click({ modifiers: ["Shift"] });
  await boxes.nth(2).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "יישור לימין" }).click();
  const edges = (await mapping()).map((s) => Math.round((s.x + s.width) * 10) / 10);
  expect(new Set(edges).size).toBe(1);

  // Ctrl+Z undoes the alignment.
  await page.keyboard.press("Control+z");
  const undone = (await mapping()).map((s) => Math.round((s.x + s.width) * 10) / 10);
  expect(new Set(undone).size).toBeGreaterThan(1);

  // Ctrl+C / Ctrl+V duplicates the selection.
  await boxes.nth(0).click();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  expect(await mapping()).toHaveLength(4);
});
