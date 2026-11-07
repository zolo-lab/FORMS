import { describe, expect, it } from "vitest";
import { detectFields } from "@/lib/pdf/detect";
import { documentTextBlocks } from "@/lib/pdf/text-blocks";
import type { GuessPage } from "@/lib/pdf/guess";
import type { PageLabel } from "@/lib/pdf/labels";

const label = (id: string, str: string, x: number, y: number, width: number, height = 11): PageLabel => ({ id, page: 0, str, x, y, width, height });
const page = (labels: PageLabel[]): GuessPage => ({ index: 0, width: 595, height: 842, labels, shapes: { lines: [], boxes: [], checkboxes: [], combs: [] } });

// The letter from 7.11.2026: a title, a numbered list with wrapped lines, then "חתימה … תאריך".
const letter = page([
  label("t", "אלו המשימות שיש לנו", 432, 760, 100, 13),
  label("p1", "1. להשיג את השטחים של רגבים בעמק וגולן", 300, 735, 232),
  label("p2", "שלנו ואולי שדובי ינסה להביא אלינו את רגבים בנגב.", 300, 721, 232),
  label("p3", "2. מיטל מחר תסיים עם האיפוס על השטחים", 300, 707, 232),
  label("p4", "חוסרים לכל מוסדות רגבים", 412, 693, 120),
  label("s", "חתימה", 500, 600, 32),
  label("d", "תאריך", 330, 600, 30),
]);

describe("documentTextBlocks: the document's own text for the responsive form", () => {
  const fields = detectFields([letter]);
  const blocks = documentTextBlocks([letter], fields);
  it("keeps the title and the list as text, in reading order, without the names of the fields", () => {
    expect(blocks.map((b) => [b.heading, b.text])).toEqual([
      [true, "אלו המשימות שיש לנו"],
      [false, "1. להשיג את השטחים של רגבים בעמק וגולן שלנו ואולי שדובי ינסה להביא אלינו את רגבים בנגב.\n2. מיטל מחר תסיים עם האיפוס על השטחים חוסרים לכל מוסדות רגבים"],
    ]);
  });
  it("a proposal the admin did not keep stays as text", () => {
    const onlyDate = fields.filter((f) => f.label === "תאריך");
    expect(documentTextBlocks([letter], onlyDate).map((b) => b.text)).toContain("חתימה");
  });
  it("blocks sit above the fields that follow them (for the reading order)", () => {
    const sign = fields.find((f) => f.label === "חתימה")!;
    expect(blocks.every((b) => b.box.y > sign.box.y + sign.box.height)).toBe(true);
  });
});

describe("documentTextBlocks: columns and renamed fields", () => {
  it("text in two columns at the same height stays in two paragraphs, right column first", () => {
    const twoCols = page([
      label("r1", "הוראות למילוי הטופס", 360, 760, 170),
      label("r2", "יש לצרף צילום תעודת זהות", 360, 746, 170),
      label("l1", "לשימוש המשרד בלבד", 60, 760, 150),
      label("l2", "התקבל בתאריך", 60, 746, 150),
    ]);
    expect(documentTextBlocks([twoCols], []).map((b) => b.text)).toEqual([
      "הוראות למילוי הטופס יש לצרף צילום תעודת זהות",
      "לשימוש המשרד בלבד התקבל בתאריך",
    ]);
  });
  it("the printed name of a field renamed in the dialog, or with a remark in brackets, is not repeated as text", () => {
    const form = page([label("n", "מספר זהות (9 ספרות):", 430, 760, 100), label("x", "פרטים נוספים בהמשך", 300, 700, 230)]);
    const field = { page: 0, label: "תעודת זהות של העובד", box: { x: 250, y: 755, width: 170, height: 16 }, aliases: ["מספר זהות"] };
    expect(documentTextBlocks([form], [field]).map((b) => b.text)).toEqual(["פרטים נוספים בהמשך"]);
  });
});

describe("addDetectedFields with the document's text", () => {
  it("puts the title and the paragraph before the signature and the date, as text the signer does not fill", async () => {
    const { addDetectedFields } = await import("@/lib/forms/pdf-draw");
    const { blankForm } = await import("@/lib/forms/builder");
    const fields = detectFields([letter]);
    let n = 0;
    const { definition, stamps } = addDetectedFields(blankForm("מכתב"), fields, [], () => `s${++n}`, { texts: documentTextBlocks([letter], fields) });
    expect(definition.pages.flatMap((p) => p.fields).map((f) => [f.type, f.label])).toEqual([
      ["heading", "אלו המשימות שיש לנו"],
      ["info_text", expect.stringContaining("1. להשיג")],
      ["signature", "חתימה"],
      ["date", "תאריך"],
    ]);
    // Nothing is drawn on the PDF for the text.
    expect(stamps.every((s) => !s.fieldId.startsWith("pdf_text_") && !s.fieldId.startsWith("pdf_heading_"))).toBe(true);
  });
  it("a form holding only text from an earlier document is still new: its text is replaced, not doubled", async () => {
    const { addDetectedFields } = await import("@/lib/forms/pdf-draw");
    const { blankForm } = await import("@/lib/forms/builder");
    const first = addDetectedFields(blankForm("מכתב"), [], [], () => "x", { texts: documentTextBlocks([letter], []) }).definition;
    const fields = detectFields([letter]);
    let n = 0;
    const again = addDetectedFields(first, fields, [], () => `s${++n}`, { texts: documentTextBlocks([letter], fields) }).definition;
    const types = again.pages.flatMap((p) => p.fields).map((f) => f.type);
    expect(types).toEqual(["heading", "info_text", "signature", "date"]);
  });
});
