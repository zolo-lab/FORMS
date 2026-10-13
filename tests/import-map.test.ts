import { describe, expect, it } from "vitest";
import { autoMap, buildRecords, convertCell, findDuplicates, targetsFor, validateRecord } from "@/lib/import/map";
import type { FormDefinition } from "@/lib/forms/schema";

const def: FormDefinition = {
  schemaVersion: 1,
  title: "בקשה",
  pages: [
    {
      id: "p",
      title: "פרטים",
      fields: [
        { id: "salary", type: "currency", label: "שכר", required: true },
        { id: "start", type: "date", label: "תאריך תחילת עבודה", required: true },
        { id: "union", type: "yes_no", label: "חבר ארגון" },
        { id: "branch", type: "dropdown", label: "סניף", options: [{ value: "tlv", label: "תל אביב" }, { value: "hfa", label: "חיפה" }] },
        { id: "calc", type: "number", label: "מחושב", formula: "1+1" },
        { id: "note", type: "info_text", label: "הסבר" },
      ],
    },
  ],
};

describe("targets and auto mapping", () => {
  it("lists subject targets plus answerable requester fields (no formulas, no layout)", () => {
    const keys = targetsFor(def).map((t) => t.key);
    expect(keys).toEqual(["subject.name", "subject.idNumber", "subject.email", "subject.phone", "answers.salary", "answers.start", "answers.union", "answers.branch"]);
  });
  it("matches headers by label, synonym or field id, using each column once", () => {
    const headers = ["שם מלא", "ת״ז", "דוא״ל", "נייד", "שכר", "תאריך תחילת עבודה", "extra", "branch"];
    const m = autoMap(headers, targetsFor(def));
    expect(m["subject.name"]).toBe(0);
    expect(m["subject.idNumber"]).toBe(1);
    expect(m["subject.email"]).toBe(2);
    expect(m["subject.phone"]).toBe(3);
    expect(m["answers.salary"]).toBe(4);
    expect(m["answers.start"]).toBe(5);
    expect(m["answers.branch"]).toBe(7);
    expect(m["answers.union"]).toBeNull();
  });
});

describe("convertCell", () => {
  const f = (id: string) => def.pages[0]!.fields.find((x) => x.id === id)!;
  it("numbers, dates, yes/no, options", () => {
    expect(convertCell(f("salary"), "₪ 9,500")).toBe(9500);
    expect(convertCell(f("start"), "01/11/2026")).toBe("2026-11-01");
    expect(convertCell(f("start"), "1.2.26")).toBe("2026-02-01");
    expect(convertCell(f("start"), "46327")).toBe("2026-11-01"); // Excel serial
    expect(convertCell(f("union"), "כן")).toBe("yes");
    expect(convertCell(f("union"), "לא")).toBe("no");
    expect(convertCell(f("branch"), "חיפה")).toBe("hfa");
    expect(convertCell(f("salary"), "")).toBeUndefined();
  });
});

describe("records and validation", () => {
  const rows = [
    ["שם", "מייל", "טלפון", 'ת"ז', "שכר", "תאריך תחילת עבודה", "סניף"],
    ["דנה כהן", "dana@example.org", "501234567", "123456782", "9000", "2026-11-01", "חיפה"],
    ["", "bad", "12", "111", "", "", ""],
    ["", "", "", "", "", "", ""],
    ["אבי לוי", "avi@example.org", "", "", "8000", "2026-11-01", ""],
  ];
  const mapping = autoMap(rows[0]!, targetsFor(def));
  const records = buildRecords(rows, mapping, def);
  it("skips empty rows, numbers rows like the sheet, restores a lost leading zero", () => {
    expect(records.map((r) => r.row)).toEqual([2, 3, 5]);
    expect(records[0]!.subject.phone).toBe("0501234567");
    expect(records[0]!.answers).toEqual({ salary: 9000, start: "2026-11-01", branch: "hfa" });
  });
  it("a valid row has no errors", () => {
    expect(validateRecord(records[0]!, def, { send: true })).toEqual([]);
  });
  it("reports each problem of a bad row", () => {
    const errs = validateRecord(records[1]!, def, { send: true });
    expect(errs).toEqual(expect.arrayContaining(["חסר שם", "מייל לא תקין", "טלפון לא תקין", 'ת"ז לא תקינה']));
    expect(errs.some((e) => e.startsWith("שכר"))).toBe(true);
  });
  it("sending needs a way to reach the employee", () => {
    const noContact = { ...records[2]!, subject: { name: "אבי" } };
    expect(validateRecord(noContact, def, { send: true })).toContain("חסר מייל או טלפון לשליחה");
    expect(validateRecord(noContact, def, { send: false })).not.toContain("חסר מייל או טלפון לשליחה");
  });
  it("finds duplicates inside the file", () => {
    const dup = [records[0]!, { ...records[0]!, row: 9 }];
    expect(findDuplicates(dup)).toEqual([{ row: 9, message: "כפילות עם שורה 2" }]);
  });
});
