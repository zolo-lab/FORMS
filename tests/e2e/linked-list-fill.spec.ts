import { expect, test } from "@playwright/test";
import { login, newFormFromPdf } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

// The desktop table and the phone cards both render; only one is visible at a time.
const visible = "visible=true";

/**
 * End to end: a list of suppliers with two records, a form linked to it from the builder (picker + fields added in
 * one click), published, then filled from its public link – picking a supplier fills its fields and narrows its
 * choice; the submitted request holds the record's values.
 */
test("a form linked to a list: pick a record, its fields fill and its options narrow, the request keeps them", async ({ page, context }) => {
  await login(page, "/admin/lists");
  const stamp = Date.now();
  const typeName = `סוג בדיקה ספקים ${stamp}`;

  // --- The list: שם, טלפון, ירקות (a choice) and two suppliers with different vegetables. ---
  await page.getByRole("button", { name: "סוג רשימה" }).click();
  const create = page.getByRole("dialog", { name: "סוג רשימה חדש" });
  await create.getByLabel("שם הסוג").fill(typeName);
  await create.getByRole("button", { name: "שדה", exact: true }).click();
  await create.getByLabel("שם שדה 2").fill("טלפון");
  await create.getByLabel("סוג שדה 2").selectOption("phone");
  await create.getByRole("button", { name: "יצירה" }).click();
  await expect(page.getByRole("heading", { name: typeName, level: 2 })).toBeVisible();

  await page.getByRole("button", { name: "שדה", exact: true }).click();
  const add = page.getByRole("dialog", { name: "שדה חדש" });
  await add.getByLabel("שם השדה").fill("ירקות");
  await add.getByLabel("סוג").selectOption("select");
  await add.getByLabel("אפשרות 1", { exact: true }).fill("עגבניה");
  await add.getByLabel("אפשרות 1", { exact: true }).press("Enter");
  await add.getByLabel("אפשרות 2", { exact: true }).fill("מלפפון");
  await add.getByLabel("אפשרות 2", { exact: true }).press("Enter");
  await add.getByLabel("אפשרות 3", { exact: true }).fill("גזר");
  await add.getByRole("button", { name: "הוספה" }).click();
  await expect(add).toBeHidden();

  for (const [name, phone] of [
    ["גדע ירקות", "0501234567"],
    ["שלום פירות", "0521234567"],
  ] as const) {
    await page.getByRole("button", { name: "רשומה", exact: true }).click();
    const nameCell = page.getByLabel("שם – ללא שם").locator(visible).first();
    await nameCell.fill(name);
    await nameCell.blur();
    await expect(page.getByText(/כל השינויים נשמרו/)).toBeVisible();
    const phoneCell = page.getByLabel(`טלפון – ${name}`).locator(visible);
    await phoneCell.fill(phone);
    await phoneCell.blur();
    await expect(page.getByText(/כל השינויים נשמרו/)).toBeVisible();
  }
  // גדע offers tomatoes only; שלום tomatoes and cucumbers.
  const tick = async (who: string, veg: string) => {
    const cell = page.getByRole("button", { name: `ירקות – ${who}` }).locator(visible);
    await cell.click();
    await page.getByRole("group", { name: `ירקות – ${who}` }).getByRole("checkbox", { name: veg }).check();
    await expect(page.getByText(/כל השינויים נשמרו/)).toBeVisible();
    await page.mouse.click(5, 5);
  };
  await tick("גדע ירקות", "עגבניה");
  await tick("שלום פירות", "עגבניה");
  await tick("שלום פירות", "מלפפון");

  // --- The form: linked to the list from the builder, everything added in one click, then published. ---
  const title = `טופס ספק e2e ${stamp}`;
  await newFormFromPdf(page, title);
  await page.getByRole("tab", { name: "רספונסיבי" }).click();
  await page.getByRole("button", { name: "שדות מרשימה" }).click();
  const dialog = page.getByRole("dialog", { name: "שדות מרשימה" });
  await dialog.getByRole("button", { name: new RegExp(`^${typeName}`) }).click();
  // The filler picks the record (the default): a picker is added with the fields.
  await expect(dialog.getByText("הממלא יבחר בטופס")).toBeVisible();
  await expect(dialog.getByText("יתווסף כ", { exact: false }).first()).toBeVisible();
  await dialog.getByRole("button", { name: /^הוספת 3 שדות מקושרים/ }).click();
  await expect(dialog).toBeHidden();
  // The links tab shows them all linked, with the picker.
  await page.getByRole("button", { name: "שדות מרשימה" }).click();
  await dialog.getByRole("tab", { name: "קישורים בטופס" }).click();
  await dialog.getByLabel("מאגר").selectOption({ label: typeName });
  await expect(dialog.getByText(`הממלא בוחר את הרשומה בשדה «${typeName}»`)).toBeVisible();
  await expect(dialog.getByText("לא נמצא בטופס")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "פרסום" }).click();
  await expect(page.getByText("גרסה 1 פורסמה")).toBeVisible({ timeout: 20_000 });

  // --- Filling from the public link, not logged in. ---
  await page.goto("/admin/forms");
  const list = page.getByLabel(`קישורים למילוי – ${title}`);
  if ((await list.count()) > 0) await list.click();
  const href = (await page.getByRole("link", { name: new RegExp(`^פתיחת הקישור למילוי – ${title}`) }).first().getAttribute("href"))!;
  await context.clearCookies();
  await page.goto(href);

  const picker = page.getByRole("combobox", { name: typeName });
  await expect(picker).toBeVisible();
  // The linked fields wait, locked, for a record.
  await expect(page.getByLabel("שם", { exact: true })).toHaveValue("");
  await picker.fill("שלום");
  await page.getByRole("option", { name: "שלום פירות" }).click();
  await expect(page.getByLabel("שם", { exact: true })).toHaveValue("שלום פירות");
  await expect(page.getByLabel("שם", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("טלפון", { exact: true })).toHaveValue("0521234567");
  const veg = page.getByLabel("ירקות", { exact: true });
  await expect(veg.getByRole("option")).toHaveText(["בחר…", "עגבניה", "מלפפון"]);

  // Another record: other values, other options.
  await picker.fill("גדע");
  await page.getByRole("option", { name: "גדע ירקות" }).click();
  await expect(page.getByLabel("טלפון", { exact: true })).toHaveValue("0501234567");
  await expect(veg.getByRole("option")).toHaveText(["בחר…", "עגבניה"]);
  await veg.selectOption("עגבניה");

  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText(/נשלח|תודה/).first()).toBeVisible({ timeout: 20_000 });

  // --- Back as admin: the request holds the record's values. ---
  await login(page, "/admin/requests");
  const row = page.getByRole("row").filter({ hasText: title }).first();
  await expect(row).toContainText("גדע ירקות");
  await row.getByRole("link", { name: "גדע ירקות" }).click();
  await expect(page.getByText("0501234567").first()).toBeVisible();
});
