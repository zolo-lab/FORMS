/**
 * The real Form 101 (tests/fixtures/form101-pages.json): what detection must find, labelled by hand, part by part.
 * Only the regions listed are scored, so a part can be added when it is labelled.
 */
import type { ExpectedFieldSpec } from "../../src/lib/pdf/detect-eval";

export const FORM101_REGIONS: { page: number; y1: number; y2: number; name: string }[] = [
  { page: 0, y1: 530, y2: 565, name: "ב – מין, מצב משפחתי, תושב ישראל, קיבוץ, קופת חולים" },
  { page: 0, y1: 579, y2: 592, name: "ב – כתובת: רחוב/שכונה, מספר, עיר/ישוב, מיקוד (שם מתחת לקו)" },
];

export const FORM101_EXPECTED: ExpectedFieldSpec[] = [
  { page: 0, label: "מין", type: "radio", options: ["זכר", "נקבה"] },
  { page: 0, label: "מצב משפחתי", type: "radio", options: ["רווק/ה", "נשוי/אה", "גרוש/ה", "אלמן/ה", "פרוד/ה"] },
  { page: 0, label: "תושב ישראל", type: "yes_no", options: ["כן", "לא"] },
  { page: 0, label: "חבר קיבוץ/מושב שיתופי", type: "radio", options: ["לא", "כן. הכנסותיי ממעסיק זה מועברות לקיבוץ", "כן. הכנסותיי ממעסיק זה אינן מועברות לקיבוץ"] },
  { page: 0, label: "חבר בקופת חולים", type: "radio", options: ["לא", "כן, שם הקופה"] },
  // The address row: each small name sits under the writing line, in its walled cell.
  { page: 0, label: "רחוב/שכונה", type: "short_text", area: { x: 229, y: 583, width: 163, height: 7 } },
  { page: 0, label: "מספר", type: "number", area: { x: 203, y: 583, width: 26, height: 7 } },
  { page: 0, label: "עיר/ישוב", type: "short_text", area: { x: 108, y: 583, width: 95, height: 7 } },
  { page: 0, label: "מיקוד", type: "number", area: { x: 33, y: 583, width: 75, height: 7 } },
  // The passport cell beside the address row (its box sits in the region too).
  { page: 0, label: "מספר דרכון", type: "short_text", area: { x: 393, y: 576, width: 147, height: 20 } },
];

export const FORM101_NOT_FIELDS: string[] = [];
