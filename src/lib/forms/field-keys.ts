/**
 * Readable field ids from Hebrew labels: "שם פרטי" in the section "פרטי העובד" → "employee_firstName".
 * Ids must match /^[a-zA-Z][a-zA-Z0-9_]*$/ (schema.ts). Known words come from a dictionary; anything else is
 * transliterated ("קופת חולים" → "kupatCholim"). Pure.
 */
import { normalizeText } from "@/lib/pdf/match";

/** Phrases first (longest match wins), after normalizeText (no punctuation, final letters folded). */
const PHRASES: [string, string][] = [
  ["מספר תיק ניכויים", "deductionsFile"],
  ["תיק ניכויים", "deductionsFile"],
  ["כתובת דואר אלקטרוני", "email"],
  ["דואר אלקטרוני", "email"],
  ["מספר טלפון נייד", "mobile"],
  ["טלפון נייד", "mobile"],
  ["מספר טלפון", "phone"],
  ["תאריך תחילת העבודה", "startDate"],
  ["תאריך תחילה העבודה", "startDate"],
  ["תאריך תחילת השירות", "serviceStart"],
  ["תאריך סיום השירות", "serviceEnd"],
  ["תאריך לידה", "birthDate"],
  ["תאריך עליה", "aliyaDate"],
  ["תאריך עלייה", "aliyaDate"],
  ["תאריך השינוי", "changeDate"],
  ["תאריך ההודעה", "noticeDate"],
  ["מספר זהות", "idNumber"],
  ["תעודת זהות", "idNumber"],
  ["מספר דרכון", "passport"],
  ["שם פרטי", "firstName"],
  ["שם משפחה", "lastName"],
  ["מצב משפחתי", "maritalStatus"],
  ["תושב ישראל", "israeliResident"],
  ["קופת חולים", "healthFund"],
  ["כתובת פרטית", "address"],
  ["מספר חשבון", "accountNumber"],
  ["מספר סניף", "branchNumber"],
  ["הכנסה חודשית", "monthlyIncome"],
  ["סוג ההכנסה", "incomeType"],
  ["המס שנוכה", "taxDeducted"],
];

const WORDS: Record<string, string> = {
  שמ: "name", שמו: "name", תאריכ: "date", תאריך: "date", חתימה: "signature", חתימת: "signature", טלפונ: "phone", טלפון: "phone",
  נייד: "mobile", כתובת: "address", רחוב: "street", שכונה: "neighborhood", עיר: "city", ישוב: "city", יישוב: "city", מיקוד: "zip",
  מספר: "number", מינ: "gender", מין: "gender", דואל: "email", מייל: "email", אימייל: "email", הערות: "notes", בנק: "bank",
  סניפ: "branch", חשבונ: "account", סכומ: "amount", סכום: "amount", שכר: "salary", תפקיד: "role", מחלקה: "department",
  כמות: "quantity", גיל: "age", פקס: "fax", הצהרה: "declaration", ילדים: "children", ילד: "child", העובד: "employee", עובד: "employee",
  המבקש: "applicant", מבקש: "applicant", המעסיק: "employer", מעסיק: "employer", מתאריכ: "fromDate", מתאריך: "fromDate",
};

/** Words in a section heading → prefix. */
const SECTIONS: [string, string][] = [
  ["הזוג", "spouse"],
  ["ילדי", "children"],
  ["מעסיק", "employer"],
  ["עובד", "employee"],
  ["הכנסות אחרות", "otherIncome"],
  ["הכנסות", "income"],
  ["שינויים", "changes"],
  ["פטור", "exemption"],
  ["תיאום", "taxCoordination"],
  ["הצהרה", "declaration"],
  ["בנק", "bank"],
];

const LATIN: Record<string, string> = {
  א: "a", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z", ח: "ch", ט: "t", י: "y", כ: "k", ל: "l", מ: "m", נ: "n", ס: "s",
  ע: "a", פ: "p", צ: "tz", ק: "k", ר: "r", ש: "sh", ת: "t",
};

const FILLER = new Set(["של", "את", "על", "עם", "או", "ו", "כולל", "למי", "שאין", "אם", "יש"].map((w) => normalizeText(w)));

/** "/" and "-" separate words ("עיר/ישוב"); normalizeText would glue them. */
const norm = (s: string) => normalizeText(s.replace(/[/\\–-]/g, " "));
const DICT: Record<string, string> = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [norm(k), v]));

const camel = (parts: string[]) =>
  parts
    .filter((p, i) => p && p !== parts[i - 1])
    .map((p, i) => (i === 0 ? p[0]!.toLowerCase() + p.slice(1) : p[0]!.toUpperCase() + p.slice(1)))
    .join("");

function translit(word: string): string {
  return [...word].map((c) => LATIN[c] ?? (/[a-z0-9]/.test(c) ? c : "")).join("");
}

/** A dictionary word (also behind a one-letter prefix ה ו ב ל מ ש), else null. */
function knownWord(w: string): string | null {
  if (DICT[w]) return DICT[w]!;
  if (w.length > 2 && "הובלמש".includes(w[0]!) && DICT[w.slice(1)]) return DICT[w.slice(1)]!;
  return null;
}

/** "שם פרטי" → "firstName"; "חבר קיבוצ" → "chaverKibutz". Empty when nothing readable is left. */
export function labelKey(label: string): string {
  let rest = ` ${norm(label)} `;
  const parts: string[] = [];
  // Phrases anywhere in the label, in the order they appear.
  const found: { at: number; key: string; len: number }[] = [];
  for (const [he, key] of PHRASES) {
    const n = ` ${norm(he)} `;
    const at = rest.indexOf(n);
    if (at >= 0) {
      found.push({ at, key, len: n.length });
      rest = rest.slice(0, at) + " " + "\u0000".repeat(n.length - 2) + " " + rest.slice(at + n.length);
    }
  }
  const tokens = rest.split(" ").filter(Boolean);
  let pos = 0;
  const words: { at: number; key: string; known: boolean }[] = [];
  for (const t of tokens) {
    const at = rest.indexOf(t, pos);
    pos = at + t.length;
    if (t.includes("\u0000") || FILLER.has(t) || /^\d+$/.test(t)) continue;
    const k = knownWord(t);
    if (k) words.push({ at, key: k, known: true });
    else if (translit(t)) words.push({ at, key: translit(t), known: false });
  }
  // Once something is understood, words that would only be transliterated are noise ("מספר זהות 9 ספרות").
  const anyKnown = found.length > 0 || words.some((w) => w.known);
  const kept = anyKnown ? words.filter((w) => w.known) : words;
  for (const x of [...found, ...kept].sort((a, b) => a.at - b.at)) parts.push(x.key);
  return camel(parts.slice(0, 3)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);
}

/** The prefix a section heading gives its fields ("ו. פרטים על בן/בת הזוג" → "spouse"), or "". */
export function sectionKey(heading: string | undefined): string {
  if (!heading) return "";
  const n = ` ${norm(heading)} `;
  for (const [he, key] of SECTIONS) if (n.includes(norm(he))) return key;
  return "";
}

/** The id to give a field: section prefix + label key, always valid (falls back to `fallback`). */
export function fieldKey(label: string, section?: string, fallback = "field"): string {
  const base = labelKey(label);
  const prefix = sectionKey(section);
  const key = [prefix, base].filter(Boolean).join("_");
  return /^[a-zA-Z]/.test(key) ? key : fallback;
}
