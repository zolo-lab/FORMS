import { describe, expect, it } from "vitest";
import { filterCharset, matchesCharset } from "@/lib/forms/charset";
import { resolveDefault, withDefaults } from "@/lib/forms/defaults";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { parseFormDefinition, type FormDefinition, type FormField } from "@/lib/forms/schema";
import { STANDARD_FIELD_IDS } from "@/lib/forms/standard-ids";
import { validateAnswers } from "@/lib/forms/validate";
import { safeLinkUrl } from "@/lib/forms/link";
import { writeText } from "@/lib/pdf/on-document";

const TODAY = "2026-10-15";
const form = (fields: FormField[]): FormDefinition => ({ schemaVersion: 1, title: "t", pages: [{ id: "p1", title: "", fields }] });

describe("charset (ספרות / עברית / אנגלית בלבד)", () => {
  it("checks the allowed characters", () => {
    expect(matchesCharset("12345", "digits")).toBe(true);
    expect(matchesCharset("12a45", "digits")).toBe(false);
    expect(matchesCharset("ישראל בן-דוד", "hebrew")).toBe(true);
    expect(matchesCharset("ישראל Ben", "hebrew")).toBe(false);
    expect(matchesCharset("Israel 2", "english")).toBe(true);
    expect(matchesCharset("Israel ז", "english")).toBe(false);
  });

  it("drops characters that are not allowed while typing", () => {
    expect(filterCharset("05-0a1", "digits")).toBe("0501");
    expect(filterCharset("שלוםabc", "hebrew")).toBe("שלום");
    expect(filterCharset("abcשלום", "english")).toBe("abc");
    expect(filterCharset("anything", undefined)).toBe("anything");
  });

  it("is enforced by validateAnswers", () => {
    const def = form([{ id: "tik", type: "short_text", label: "תיק", validation: { charset: "digits" } }]);
    expect(validateAnswers(def, { tik: "12ab" }, { today: TODAY }).errors.tik).toBe("ספרות בלבד");
    expect(validateAnswers(def, { tik: "12345678" }, { today: TODAY }).ok).toBe(true);
  });

  it("is part of the schema", () => {
    expect(parseFormDefinition(form([{ id: "a", type: "short_text", label: "a", validation: { charset: "hebrew" } }])).success).toBe(true);
    expect(parseFormDefinition(form([{ id: "a", type: "short_text", label: "a", validation: { charset: "klingon" as never } }])).success).toBe(false);
  });

  it("filters text typed on the document", () => {
    const f: FormField = { id: "n", type: "short_text", label: "n", validation: { charset: "digits" } };
    expect(writeText(f, undefined, {}, "1a2")).toBe("12");
  });
});

describe("default values (ערך ברירת מחדל)", () => {
  const def = form([
    { id: "city", type: "short_text", label: "יישוב", defaultValue: "בית שאן" },
    { id: "start", type: "date", label: "תאריך", defaultValue: "today" },
    { id: "org", type: "short_text", label: "עמותה", defaultValue: "שיבת ציון", readOnly: true },
    { id: "kind", type: "radio", label: "סוג", options: [{ value: "a", label: "א" }, { value: "b", label: "ב" }], defaultValue: "b" },
    { id: "plain", type: "short_text", label: "רגיל" },
  ]);

  it("resolves 'today' for dates only", () => {
    expect(resolveDefault(def.pages[0]!.fields[1]!, TODAY)).toBe(TODAY);
    expect(resolveDefault({ id: "x", type: "short_text", label: "", defaultValue: "today" }, TODAY)).toBe("today");
    expect(resolveDefault({ id: "x", type: "short_text", label: "" }, TODAY)).toBeUndefined();
  });

  it("fills blank answers and keeps what the filler typed", () => {
    const a = withDefaults(def, { city: "עפולה" }, TODAY);
    expect(a).toEqual({ city: "עפולה", start: TODAY, org: "שיבת ציון", kind: "b" });
  });

  it("a read-only default always wins", () => {
    expect(withDefaults(def, { org: "אחר" }, TODAY).org).toBe("שיבת ציון");
  });

  it("returns the same object when nothing changes", () => {
    const a = { city: "x", start: TODAY, org: "שיבת ציון", kind: "a" };
    expect(withDefaults(def, a, TODAY)).toBe(a);
  });

  it("the server stores the defaults even when the client sent nothing", () => {
    const r = validateAnswers(def, { org: "זיוף" }, { today: TODAY });
    expect(r.ok).toBe(true);
    expect(r.cleaned).toMatchObject({ city: "בית שאן", start: TODAY, org: "שיבת ציון", kind: "b" });
    expect(r.cleaned.plain).toBeUndefined();
  });

  it("a required field with a default is satisfied", () => {
    const d = form([{ id: "a", type: "short_text", label: "a", required: true, defaultValue: "x" }]);
    expect(validateAnswers(d, {}, { today: TODAY }).ok).toBe(true);
  });
});

describe("link field (קישור)", () => {
  it("is a layout block without an answer", () => {
    expect(FIELD_TYPE_META.link.hasAnswer).toBe(false);
    const d = form([{ id: "l", type: "link", label: "תקנון", settings: { url: "https://example.org" } }]);
    expect(parseFormDefinition(d).success).toBe(true);
    expect(validateAnswers(d, { l: "x" }, { today: TODAY }).cleaned).toEqual({});
  });

  it("renders only safe URLs", () => {
    expect(safeLinkUrl(" https://a.org/x ")).toBe("https://a.org/x");
    expect(safeLinkUrl("mailto:a@b.org")).toBe("mailto:a@b.org");
    expect(safeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(safeLinkUrl("data:text/html,x")).toBeNull();
  });
});

describe("standard field ids (שמות מזהים כמו ב-iForms)", () => {
  it("are valid field ids and unique", () => {
    const ids = STANDARD_FIELD_IDS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*$/);
    expect(ids).toEqual(expect.arrayContaining(["fname", "lname", "id_number", "mobile", "email_address", "manager"]));
  });
});
