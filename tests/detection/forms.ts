/**
 * The detection test bank: one small form per layout pattern seen on Israeli HR / government forms, plus mixed
 * forms that put them together. Each states what must be found (kit.ts). Add a case whenever a real form surprises us.
 */
import { FormDraw, type TestForm } from "./kit";

type Case = () => Promise<TestForm>;

const R = 550;

export const CASES: Record<string, Case> = {
  async underline() {
    const f = await FormDraw.create();
    f.heading("א. פרטים אישיים", R, 790);
    f.underline("שם פרטי", "short_text", R, 760);
    f.underline("שם משפחה", "short_text", R, 735);
    f.underline("כתובת דואר אלקטרוני", "email", R, 710);
    f.underline("טלפון נייד", "phone", R, 685);
    f.underline("תאריך לידה", "date", R, 660);
    return f.build("underline", "תווית + קו מתחת");
  },

  async boxes() {
    const f = await FormDraw.create();
    f.box("כתובת מגורים", "short_text", R, 760);
    f.box("עיר", "short_text", R, 735, 120);
    f.box("הערות", "long_text", R, 680, 300, 40);
    return f.build("boxes", "תווית + מלבן");
  },

  async labelAbove() {
    const f = await FormDraw.create();
    f.labelAbove("שם המעסיק", "short_text", R, 760);
    f.labelAbove("כתובת המעסיק", "short_text", R, 720);
    return f.build("labelAbove", "תווית מעל הקו");
  },

  async twoOnALine() {
    const f = await FormDraw.create();
    const left = f.underline("שם פרטי", "short_text", R, 760, 110);
    f.underline("שם משפחה", "short_text", left - 20, 760, 110);
    const l2 = f.underline("עיר", "short_text", R, 730, 90);
    f.underline("מיקוד", "number", l2 - 20, 730, 70);
    return f.build("twoOnALine", "שני שדות באותה שורה");
  },

  async combs() {
    const f = await FormDraw.create();
    f.comb("מספר זהות", "id_number", R, 760, 9);
    f.comb("מספר טלפון", "phone", R, 730, 10);
    return f.build("combs", "תאים לכל ספרה (ת\"ז, טלפון)");
  },

  async labelOnly() {
    const f = await FormDraw.create();
    f.heading("פרטי המעסיק", R, 790);
    f.labelOnly("שם המעסיק", "short_text", R, 760);
    f.labelOnly("מספר תיק ניכויים", "number", R, 735);
    return f.build("labelOnly", "שם בלי קו ובלי תיבה");
  },

  async signatureAndDate() {
    const f = await FormDraw.create();
    f.note("אני מצהיר/ה כי הפרטים שמסרתי בטופס זה הם מלאים ונכונים.", R, 780);
    f.underline("תאריך", "date", R, 740, 100);
    f.signature("חתימת העובד/ת", R, 700);
    return f.build("signatureAndDate", "חתימה ותאריך עם קו");
  },

  async consents() {
    const f = await FormDraw.create();
    f.consent("אני תושב/ת קבע בישוב מזכה", R, 760);
    f.consent("אני עולה חדש/ה מתאריך הקליטה בארץ", R, 740);
    f.consent("אין לי הכנסות אחרות ממשכורת", R, 720);
    return f.build("consents", "תיבה + הצהרה ארוכה");
  },

  async optionsRow() {
    const f = await FormDraw.create();
    f.optionsRow("מין", ["זכר", "נקבה"], R, 760);
    f.optionsRow("סוג המשרה", ["מלאה", "חלקית", "שעתית"], R, 735);
    return f.build("optionsRow", "שאלה ואפשרויות בשורה");
  },

  async yesNo() {
    const f = await FormDraw.create();
    f.optionsRow("האם יש לך רכב", ["כן", "לא"], R, 760, "yes_no");
    f.optionsRow("חבר בקופת חולים", ["כן", "לא"], R, 735, "yes_no");
    return f.build("yesNo", "כן / לא");
  },

  async optionsColumn() {
    const f = await FormDraw.create();
    f.optionsColumn("מצב משפחתי", ["רווק/ה", "נשוי/אה", "גרוש/ה", "אלמן/ה"], R, 760);
    return f.build("optionsColumn", "אפשרויות זו מתחת לזו");
  },

  async choiceCells() {
    const f = await FormDraw.create();
    f.choiceCells(
      [
        { title: "מין", options: [["זכר"], ["נקבה"]] },
        { title: "מצב משפחתי", options: [["רווק/ה", "נשוי/אה", "גרוש/ה"], ["אלמן/ה", "פרוד/ה"]] },
        { title: "תושב ישראל", options: [["כן"], ["לא"]] },
      ],
      R, 760, [60, 210, 80],
    );
    return f.build("choiceCells", "כמה שאלות בשורת טבלה (101 חלק ב')");
  },

  async typedLines() {
    const f = await FormDraw.create();
    f.typedLine("שם פרטי", "short_text", R, 760);
    f.typedLine("שם משפחה", "short_text", R, 735);
    f.typedLine("תאריך", "date", R, 710, 16);
    f.typedLine("כתובת", "short_text", R, 685, 40, ".");
    return f.build("typedLines", "קו מוקלד: ____ או ....");
  },

  async gridCells() {
    const f = await FormDraw.create();
    f.gridCells(
      [
        { title: "מספר זהות", type: "id_number" },
        { title: "שם משפחה", type: "short_text" },
        { title: "שם פרטי", type: "short_text" },
        { title: "תאריך לידה", type: "date" },
      ],
      R, 740, [110, 120, 110, 100],
    );
    return f.build("gridCells", "טבלת כותרות עם מקום ריק מתחת (101 חלק א')");
  },

  async gridLabelsBelow() {
    const f = await FormDraw.create();
    f.gridLabelsBelow(
      [
        { title: "רחוב/שכונה", type: "short_text" },
        { title: "מספר", type: "number" },
        { title: "עיר/ישוב", type: "short_text" },
        { title: "מיקוד", type: "number" },
      ],
      R, 740, [180, 60, 140, 80],
    );
    return f.build("gridLabelsBelow", "שם קטן בתחתית התא, מקום הכתיבה מעליו");
  },

  async captionsUnderLine() {
    const f = await FormDraw.create();
    f.captionsUnderLine(
      [
        { title: "רחוב/שכונה", type: "short_text" },
        { title: "מספר", type: "number" },
        { title: "עיר/ישוב", type: "short_text" },
        { title: "מיקוד", type: "number" },
      ],
      R, 740, [150, 40, 110, 60],
    );
    return f.build("captionsUnderLine", "שם קטן מתחת לקו, תא תחום בקירות בלבד (101 כתובת)");
  },

  async labelValueTable() {
    const f = await FormDraw.create();
    f.labelValueTable(
      [
        { title: "שם העמותה", type: "short_text" },
        { title: "מספר עמותה", type: "number" },
        { title: "כתובת", type: "short_text" },
      ],
      R, 760,
    );
    return f.build("labelValueTable", "טבלת שם | תא ריק לכתיבה");
  },

  async headingsAreNotFields() {
    const f = await FormDraw.create();
    f.heading("פרטי המעסיק", R, 790);
    f.underline("שם המעסיק", "short_text", R, 765);
    f.heading("הצהרת העובד", R, 735);
    f.note("יש למלא את כל הפרטים בכתב יד ברור", R, 715);
    f.underline("כתובת", "short_text", R, 690);
    return f.build("headingsAreNotFields", "כותרות והסברים בלי מספור");
  },

  async tableWithTitle() {
    const f = await FormDraw.create();
    f.table("פרטי ילדים", ["שם", "מספר זהות", "תאריך לידה"], R, 720);
    return f.build("tableWithTitle", "טבלה עם כותרת מעליה");
  },

  async longOptions() {
    const f = await FormDraw.create();
    f.longOptionsCell("חבר קיבוץ/מושב שיתופי", ["לא", "כן, הכנסותיי ממעסיק זה מועברות לקיבוץ", "כן, הכנסותיי ממעסיק זה אינן מועברות לקיבוץ"], R, 760);
    return f.build("longOptions", "אפשרויות ארוכות בתא עם כותרת");
  },

  async labelsWithoutPlace() {
    const f = await FormDraw.create();
    f.labelOnly("שם העובד", "short_text", R, 760);
    f.signatureLabelOnly("חתימת המעסיק", R, 730);
    return f.build("labelsWithoutPlace", "שם וחתימה בלי שום קו");
  },

  async otherOption() {
    const f = await FormDraw.create();
    f.optionsWithOther("סוג ההכנסה", ["משכורת", "קצבה"], R, 760);
    return f.build("otherOption", "אפשרות \"אחר\" עם קו");
  },

  async dateCells() {
    const f = await FormDraw.create();
    f.comb("תאריך תחילת עבודה", "date", R, 760, 8);
    return f.build("dateCells", "תאריך בתאים");
  },

  async alignedNoWalls() {
    const f = await FormDraw.create();
    f.alignedQuestions(
      [
        { title: "מין", options: [["זכר"], ["נקבה"]] },
        { title: "מצב משפחתי", options: [["רווק/ה", "נשוי/אה", "גרוש/ה"], ["אלמן/ה", "פרוד/ה"]] },
        { title: "תושב ישראל", options: [["כן"], ["לא"]] },
      ],
      R, 760, [60, 210, 80],
    );
    return f.build("alignedNoWalls", "שאלות זו לצד זו בלי קווים (101 חלק ב' בלי טבלה)");
  },

  async englishLtr() {
    const f = await FormDraw.create();
    f.underlineLtr("Full name", "short_text", 50, 760);
    f.underlineLtr("Email", "email", 50, 735);
    f.underlineLtr("Phone", "phone", 50, 710);
    return f.build("englishLtr", "טופס באנגלית: תווית משמאל, קו מימין");
  },

  async englishTypedRow() {
    const f = await FormDraw.create();
    f.typedRowLtr([{ label: "Name", type: "short_text", chars: 12 }, { label: "ID", type: "id_number", chars: 12 }], 50, 760);
    f.typedRowLtr([{ label: "Date", type: "date", chars: 10 }, { label: "Signature", type: "signature", chars: 14 }], 50, 720);
    return f.build("englishTypedRow", "שורה מוקלדת באנגלית עם שני שדות");
  },

  async twoLineTitles() {
    const f = await FormDraw.create();
    f.gridTwoLineTitles(
      [
        { title: ["מספר תיק", "ניכויים"], label: "מספר תיק", type: "number" },
        { title: ["שם", "המעסיק"], label: "שם", type: "short_text" },
        { title: ["טלפון", "המעסיק"], label: "טלפון", type: "phone" },
      ],
      R, 730, [120, 160, 110],
    );
    return f.build("twoLineTitles", "כותרת תא בשתי שורות");
  },

  async optionsBelow() {
    const f = await FormDraw.create();
    f.optionsBelow("האם יש לך הכנסה נוספת", ["כן", "לא"], R, 760, "yes_no");
    f.optionsBelow("סוג ההכנסה הנוספת", ["משכורת", "קצבה", "מלגה"], R, 715);
    return f.build("optionsBelow", "שאלה בשורה, אפשרויות בשורה מתחת");
  },

  async bankCombs() {
    const f = await FormDraw.create();
    f.combsRow(
      [
        { label: "בנק", cells: 2, type: "number" },
        { label: "סניף", cells: 3, type: "number" },
        { label: "מספר חשבון", cells: 9, type: "number" },
      ],
      R, 760,
    );
    f.asBankAccount(["בנק", "סניף", "מספר חשבון"]);
    return f.build("bankCombs", "כמה שורות תאים באותה שורה (פרטי בנק)");
  },

  async residency() {
    const f = await FormDraw.create();
    f.heading("הצהרת תושבות", R, 805);
    f.note("יש לצרף אישור תושבות מהרשות המקומית", R, 785);
    f.gridCells([{ title: "שם משפחה", type: "short_text" }, { title: "שם פרטי", type: "short_text" }, { title: "מספר זהות", type: "id_number" }], R, 735, [140, 140, 120]);
    f.alignedQuestions([{ title: "מין", options: [["זכר"], ["נקבה"]] }, { title: "תושב ישראל", options: [["כן"], ["לא"]] }], R, 690, [70, 90]);
    f.underline("שם הישוב", "short_text", R, 640);
    f.typedLine("תאריך תחילת מגורים", "date", R, 615, 16);
    f.consent("אני מצהיר/ה כי מרכז חיי בישוב זה", R, 590);
    f.signature("חתימת המצהיר/ה", R, 555);
    return f.build("residency", "טופס משולב: הצהרת תושבות");
  },

  async employeeNotice() {
    const f = await FormDraw.create();
    f.heading("הודעה לעובד/ת על תנאי עבודה", R, 800);
    f.typedLine("1. זהות המעביד", "short_text", R, 760, 20);
    f.typedLine("2. תאריך תחילת העבודה", "date", R, 735, 14);
    f.note("העובד מוותר בזאת על כל טענה כלפי המעסיק בגין אי ביצוע הפקדות", R, 700);
    f.underlinedText("בחירת הקופה, ככל שלא פעל בהתאם לחובותיו", R, 686);
    f.note("הריני מאשר שקראתי והבנתי את האמור", R, 660);
    f.signatureCaptions(["חתימת עובד/ת", "חתימת המעסיק"], 420, 560);
    return f.build("employeeNotice", "הודעה לעובד: קווים מוקלדים, טקסט עם קו תחתון, חתימות בלי קו");
  },

  async unreadablePage() {
    const f = await FormDraw.create();
    f.linesOnly([{ x1: 380, x2: 500, y: 700 }, { x1: 160, x2: 290, y: 700 }, { x1: 380, x2: 500, y: 640 }]);
    return f.build("unreadablePage", "עמוד שהמילים בו לא קריאות (מצוירות כצורות): שדה בלי שם לכל קו");
  },

  async employment() {
    const f = await FormDraw.create();
    f.heading("טופס פרטי עובד", R, 805);
    f.heading("א. פרטי העובד", R, 780);
    const l = f.underline("שם פרטי", "short_text", R, 755, 110);
    f.underline("שם משפחה", "short_text", l - 20, 755, 110);
    f.comb("מספר זהות", "id_number", R, 725, 9);
    f.underline("תאריך לידה", "date", R, 700, 100);
    f.box("כתובת", "short_text", R, 670, 260);
    f.underline("טלפון נייד", "phone", R, 645, 120);
    f.optionsRow("מין", ["זכר", "נקבה"], R, 620);
    f.heading("ב. פרטי חשבון בנק", R, 590);
    f.underline("שם הבנק", "short_text", R, 565, 120);
    f.underline("מספר סניף", "number", R, 540, 80);
    f.underline("מספר חשבון", "number", R, 515, 120);
    f.asBankAccount(["שם הבנק", "מספר סניף", "מספר חשבון"]);
    f.heading("ג. הצהרה", R, 485);
    f.consent("אני מאשר/ת שהפרטים נכונים ומלאים", R, 460);
    f.underline("תאריך", "date", R, 430, 100);
    f.signature("חתימה", R, 400);
    return f.build("employment", "טופס משולב: פרטי עובד");
  },

  async multiPage() {
    const f = await FormDraw.create();
    f.underline("שם מלא", "short_text", R, 760);
    f.optionsRow("סוג ההעסקה", ["קבוע", "זמני"], R, 730);
    f.newPage();
    f.consent("קראתי והבנתי את תנאי ההעסקה", R, 760);
    f.signature("חתימת העובד", R, 720);
    return f.build("multiPage", "שני עמודים");
  },
};

export async function allForms(): Promise<TestForm[]> {
  const out: TestForm[] = [];
  for (const make of Object.values(CASES)) out.push(await make());
  return out;
}
