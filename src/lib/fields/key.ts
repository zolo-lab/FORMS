/**
 * The internal name ("שם פנימי") of an identifying field. People see and type the Hebrew name; the internal name is
 * made from it automatically (common names are translated, the rest transliterated, in camelCase like the form field
 * ids) and can be changed. Forms point at the internal name, so it is plain ASCII. Pure, unit tested.
 */

export const FIELD_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
export const FIELD_KEY_MAX = 40;

/** Common Hebrew names and the internal name they get (whole name, after normalizing). */
const KNOWN: Record<string, string> = {
  "שם": "name",
  "שם מלא": "fullName",
  "שם פרטי": "firstName",
  "שם משפחה": "lastName",
  "תעודת זהות": "idNumber",
  "תז": "idNumber",
  "מספר זהות": "idNumber",
  "טלפון": "phone",
  "טלפון נייד": "mobile",
  "נייד": "mobile",
  "מייל": "email",
  "אימייל": "email",
  "דואל": "email",
  "כתובת מייל": "email",
  "כתובת": "address",
  "עיר": "city",
  "ישוב": "city",
  "יישוב": "city",
  "רחוב": "street",
  "מיקוד": "zip",
  "חפ": "companyNumber",
  "ח פ": "companyNumber",
  "מספר עמותה": "associationNumber",
  "עוסק מורשה": "vatNumber",
  "מספר עוסק": "vatNumber",
  "שם ספק": "supplierName",
  "מספר ספק": "supplierNumber",
  "בנק": "bank",
  "מספר בנק": "bankNumber",
  "סניף": "branch",
  "מספר סניף": "branchNumber",
  "מספר חשבון": "accountNumber",
  "חשבון בנק": "bankAccount",
  "איש קשר": "contactName",
  "תאריך": "date",
  "תאריך לידה": "birthDate",
  "תיק ניכויים": "deductionsFile",
  "מספר תיק ניכויים": "deductionsFile",
  "מספר חוזה": "contractNumber",
  "תפקיד": "role",
  "הערות": "notes",
};

/** Hebrew letters to Latin, roughly by sound (final forms included). */
const LETTERS: Record<string, string> = {
  "א": "a", "ב": "b", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z", "ח": "ch", "ט": "t", "י": "y",
  "כ": "k", "ך": "k", "ל": "l", "מ": "m", "ם": "m", "נ": "n", "ן": "n", "ס": "s", "ע": "a", "פ": "p",
  "ף": "f", "צ": "tz", "ץ": "tz", "ק": "k", "ר": "r", "ש": "sh", "ת": "t",
};

/** Quotes, geresh and gershayim dropped, punctuation to spaces, spaces collapsed. */
const normalize = (label: string) =>
  label
    .replace(/["'״׳`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

const wordLatin = (w: string) => [...w.toLowerCase()].map((ch) => LETTERS[ch] ?? (/[a-z0-9]/.test(ch) ? ch : "")).join("");

/** "סוג הלינה" → "svgHlynh". */
function transliterate(text: string): string {
  return text
    .split(" ")
    .map(wordLatin)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join("");
}

/** The internal name a Hebrew (or English) name would get, before checking it is free. */
export function keyFromLabel(label: string): string {
  const n = normalize(label);
  if (!n) return "field";
  const known = KNOWN[n];
  if (known) return known;
  let key = transliterate(n);
  if (!key) return "field";
  if (!/^[a-z]/.test(key)) key = `f${key[0]!.toUpperCase()}${key.slice(1)}`;
  return key.slice(0, FIELD_KEY_MAX);
}

/** `keyFromLabel`, with a number added when the name is already taken (`supplierName2`). */
export function suggestKey(label: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((k) => k.toLowerCase()));
  const base = keyFromLabel(label);
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const k = `${base.slice(0, FIELD_KEY_MAX - String(i).length)}${i}`;
    if (!used.has(k.toLowerCase())) return k;
  }
}

/** A typed internal name, cleaned up, or null when it breaks the rules (English letter first, then letters, digits, _). */
export function normalizeFieldKey(input: string): string | null {
  const key = input.trim();
  if (!key || key.length > FIELD_KEY_MAX || !FIELD_KEY_RE.test(key)) return null;
  return key;
}
