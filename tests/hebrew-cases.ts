/**
 * Mixed-direction test strings for PDF output. Used by:
 *  - tests/bidi.test.ts (expected visual order)
 *  - scripts/pdf-sample.ts (renders all cases to a PDF for human review)
 *
 * `visual` is the expected left→right order of characters on the page.
 * Leave it undefined for cases that are only checked by eye.
 */
export interface HebrewCase {
  name: string;
  text: string;
  visual?: string;
}

export const HEBREW_CASES: HebrewCase[] = [
  { name: "שם פרטי", text: "ישראל", visual: "לארשי" },
  { name: "שם מלא", text: "ישראל זולו", visual: "ולוז לארשי" },
  { name: "כתובת עם מספר", text: "רחוב הרצל 12", visual: "12 לצרה בוחר" },
  { name: "כתובת עם דירה", text: "הרצל 12 דירה 4", visual: "4 הריד 12 לצרה" },
  { name: "דירה וקומה", text: "דירה 4, קומה 2", visual: "2 המוק ,4 הריד" },
  { name: "ת.ד.", text: "ת.ד. 123", visual: "123 .ד.ת" },
  { name: "תעודת זהות", text: "012345678", visual: "012345678" },
  { name: "תאריך", text: "01/09/2026", visual: "01/09/2026" },
  { name: "תאריך בתוך משפט", text: "החל מ-01/09/2026", visual: "01/09/2026-מ לחה" },
  { name: "סוגריים", text: "(בפועל)", visual: "(לעופב)" },
  { name: "סוגריים באמצע", text: "שכר (ברוטו) חודשי", visual: "ישדוח (וטורב) רכש" },
  { name: "אנגלית בתוך עברית", text: "Gmail של העובד", visual: "דבועה לש Gmail" },
  { name: "מייל", text: "israel@gybs.org.il", visual: "israel@gybs.org.il" },
  { name: "מייל עם תווית", text: "מייל: israel@gybs.org.il", visual: "israel@gybs.org.il :ליימ" },
  { name: "טלפון", text: "050-1234567", visual: "050-1234567" },
  { name: "טלפון עם תווית", text: "נייד 050-1234567", visual: "050-1234567 דיינ" },
  { name: "סכום בשקלים", text: "₪1,234.50", visual: "₪1,234.50" },
  { name: "סכום במשפט", text: "שכר של 8,500 ₪ לחודש", visual: "שדוחל ₪ 8,500 לש רכש" },
  { name: "אחוז משרה", text: "50% משרה", visual: "הרשמ 50%" },
  { name: "מספר חשבון", text: "12-345-678901", visual: "12-345-678901" },
  { name: "בנק וסניף", text: "בנק לאומי (10), סניף 912", visual: "912 ףינס ,(10) ימואל קנב" },
  { name: "גרשיים", text: 'מנכ"ל', visual: 'ל"כנמ' },
  { name: "גרש", text: "ג'ורג'", visual: "'גרו'ג" },
  { name: "מקף עברי", text: "בית־שאן", visual: "ןאש־תיב" },
  { name: "ע\"ר", text: 'שיבת ציון לרגבי אדמתה (ע"ר) 580556306', visual: '580556306 (ר"ע) התמדא יבגרל ןויצ תביש' },
  { name: "אנגלית בלבד", text: "Tel Aviv", visual: "Tel Aviv" },
  { name: "אנגלית ואז עברית", text: "Priority מערכת שכר", visual: "רכש תכרעמ Priority" },
  { name: "שעה", text: "בשעה 08:30", visual: "08:30 העשב" },
  { name: "רשימה עם פסיקים", text: "א, ב, ג", visual: "ג ,ב ,א" },
  { name: "שורה ריקה", text: "", visual: "" },
  {
    name: "טקסט ארוך (עטיפה)",
    text: "אני מצהיר/ה כי הפרטים שמסרתי בטופס זה הם מלאים ונכונים, וכי ידוע לי שהשמטה או מסירת פרטים לא נכונים הן עבירה על פקודת מס הכנסה.",
  },
];
